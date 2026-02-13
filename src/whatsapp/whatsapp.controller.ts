import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FlightsService } from '../flights/flights.service';
import { AiService } from 'src/ai/ai.service';
import Twilio, { twiml } from 'twilio';

type Subscription = {
  flight: string;
  lastGate: string | null;
  lastStatus: string | null;
};

@Controller('whatsapp')
export class WhatsappController {
  // ✅ These MUST be inside the class
  private activeSubscriptions: Record<string, Subscription> = {};
  private pollInterval: NodeJS.Timeout | null = null;

  // ✅ Not DI: just a normal property
  private twilioClient: ReturnType<typeof Twilio>;

  constructor(
    private flightsService: FlightsService,
    private aiService: AiService,
  ) {
    this.twilioClient = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );
  }

  private startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      const userCount = Object.keys(this.activeSubscriptions).length;
      if (userCount === 0) return;

      console.log(`🕐 [3MIN POLL] Checking ${userCount} subscriptions...`);

      // ✅ sub is typed as Subscription (not unknown)
      for (const [userAddr, sub] of Object.entries(this.activeSubscriptions)) {
        const flight = await this.flightsService.getFlightStatus(sub.flight);

        if (!flight) {
          console.log(`⚠️ Flight ${sub.flight} not found for ${userAddr}`);
          continue;
        }

        const currentGate = flight.departure?.gate || flight.arrival?.gate;

        if (currentGate && currentGate !== sub.lastGate) {
          sub.lastGate = currentGate;

          try {
            await this.twilioClient.messages.create({
              body: `🛑 GATE ANNOUNCED!\n\n${sub.flight}\nGate: ${currentGate}\n\n⏰ Hurry up!`,
              from: process.env.TWILIO_WHATSAPP_FROM!,
              to: userAddr, // ✅ already like "whatsapp:+39..."
            });
            console.log(`✅ SENT GATE ALERT to ${userAddr}`);
          } catch (err: any) {
            console.error('❌ Twilio gate alert failed:', err?.message);
          }
        }

        if (flight.flight_status !== sub.lastStatus) {
          sub.lastStatus = flight.flight_status;

          try {
            await this.twilioClient.messages.create({
              body: `📊 STATUS UPDATE\n\n${sub.flight}\n${String(flight.flight_status).toUpperCase()}`,
              from: process.env.TWILIO_WHATSAPP_FROM!,
              to: userAddr,
            });
            console.log(`✅ SENT STATUS UPDATE to ${userAddr}`);
          } catch (err: any) {
            console.error('❌ Twilio status alert failed:', err?.message);
          }
        }
      }
    }, 3 * 60 * 1000);

    console.log('✅ Polling started (3min interval)');
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response) {
    this.startPolling();

    // ✅ Twilio inbound fields
    const message = String(body?.Body ?? '').trim();
    const from = String(body?.From ?? '').trim(); // "whatsapp:+..."

    console.log(`📱 ${from}: "${message}"`);

    let responseText = '';

    const intent = await this.aiService.parseUserIntent(message);
    console.log('🧠 AI intent:', intent);

    if (intent.intent === 'flight_status' && intent.flightCode) {
      const flight = await this.flightsService.getFlightStatus(intent.flightCode);
      if (flight) {
        this.activeSubscriptions[from] = {
          flight: intent.flightCode,
          lastGate: flight.departure?.gate || flight.arrival?.gate || null,
          lastStatus: flight.flight_status ?? null,
        };
        responseText = this.flightsService.formatFlightForWhatsApp(flight);
      } else {
        responseText = `❌ Flight ${intent.flightCode} not found 😔`;
      }
    } else if (intent.intent === 'departures') {
      const flights = await this.flightsService.getDepartures('FCO', 10);
      responseText = this.flightsService.formatDeparturesList(flights);
    } else if (intent.intent === 'arrivals') {
      const flights = await this.flightsService.getArrivals('FCO', 10);
      responseText =
        `🛬 FCO Arrivals\n\n` +
        flights
          .slice(0, 10)
          .map((f: any, i: number) => {
            const t = f?.arrival?.scheduled
              ? new Date(f.arrival.scheduled).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              : 'TBA';
            return `${i + 1}. ${f?.flight?.iata ?? '—'} from ${f?.departure?.iata ?? '—'} | ${t}`;
          })
          .join('\n');
    } else if (intent.intent === 'greeting') {
      responseText = `👋 Fiumicino Airport Bot\n\n✈️ Track flight: "EK509"\n🛫 "departures"\n🛬 "arrivals"\n\nWhat do you need?`;
    } else {
      const flightMatch = message.match(/([a-zA-Z]{2}\d{3,5})/i);
      if (flightMatch) {
        const flightIata = flightMatch[1].toUpperCase();
        const flight = await this.flightsService.getFlightStatus(flightIata);

        if (flight) {
          this.activeSubscriptions[from] = {
            flight: flightIata,
            lastGate: flight.departure?.gate || flight.arrival?.gate || null,
            lastStatus: flight.flight_status ?? null,
          };
          responseText = this.flightsService.formatFlightForWhatsApp(flight);
        } else {
          responseText = `❌ Flight ${flightIata} not found 😔`;
        }
      } else {
        responseText = `🏛️ Fiumicino Airport Bot\n\n✈️ Track flight: "EK509"\n🛫 "departures"\n🛬 "arrivals"\n\nWhat do you need?`;
      }
    }

    // ✅ TwiML builder (safer than string concat)
    const tw = new twiml.MessagingResponse();
    tw.message(responseText);

    res.type('text/xml');
    res.send(tw.toString());
  }
}
