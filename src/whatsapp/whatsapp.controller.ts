import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FlightsService } from '../flights/flights.service';
import { AiService } from 'src/ai/ai.service';
import Twilio from 'twilio'; 

@Controller('whatsapp')
export class WhatsappController {
  private activeSubscriptions: {
    [phone: string]: {
      flight: string;
      lastGate: string | null;
      lastStatus: string | null;
    };
  } = {};
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    private flightsService: FlightsService,
    private aiService: AiService,
    private twilioClient = Twilio(  
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    ),
  ) {}

  // 🔥 Enhanced polling with full status tracking
  private startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      const userCount = Object.keys(this.activeSubscriptions).length;
      if (userCount === 0) return;

      console.log(`🕐 [3MIN POLL] Checking ${userCount} subscriptions...`);

      for (const [userPhone, sub] of Object.entries(this.activeSubscriptions)) {
        const flight = await this.flightsService.getFlightStatus(sub.flight);

        if (!flight) {
          console.log(`⚠️ Flight ${sub.flight} not found for ${userPhone}`);
          continue;
        }

        // 🛑 GATE CHANGE ALERT
        const currentGate = flight.departure?.gate || flight.arrival?.gate;
        if (currentGate && currentGate !== sub.lastGate) {
          sub.lastGate = currentGate;
          
          const alertMessage = `🛑 **GATE ANNOUNCED!**\n\n${sub.flight}\n**Gate: ${currentGate}**\n\n⏰ Hurry up!`;
          
          // 🔥 SEND REAL WHATSAPP
          try {
            await this.twilioClient.messages.create({
              body: alertMessage,
              from: process.env.TWILIO_WHATSAPP_FROM!,
              to: `whatsapp:${userPhone}`,
            });
            console.log(`✅ SENT GATE ALERT to ${userPhone}`);
          } catch (error) {
            console.error('❌ Twilio gate alert failed:', error.message);
          }
        }

        // 🔄 STATUS CHANGE ALERT + REAL MESSAGE
        if (flight.flight_status !== sub.lastStatus) {
          sub.lastStatus = flight.flight_status;
          
          const statusMessage = `📊 **STATUS UPDATE**\n\n${sub.flight}\n**${flight.flight_status.toUpperCase()}**`;
          
          // 🔥 SEND REAL WHATSAPP
          try {
            await this.twilioClient.messages.create({
              body: statusMessage,
              from: process.env.TWILIO_WHATSAPP_FROM!,
              to: `whatsapp:${userPhone}`,
            });
            console.log(`✅ SENT STATUS UPDATE to ${userPhone}`);
          } catch (error) {
            console.error('❌ Twilio status alert failed:', error.message);
          }
        }
      }
    }, 3 * 60 * 1000); // 3 minutes

    console.log('✅ Polling started (3min interval)');
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response) {
    this.startPolling();

    const message = (body.Body || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || '').trim();
    const phone = body.From || body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || '';

    console.log(`📱 ${phone}: "${message}"`);

    let responseText = '';

    // 🤖 AI‑powered intent detection (handles typos!)
    const intent = await this.aiService.parseUserIntent(message);
    console.log('🧠 AI intent:', intent);

    // Your existing logic, now AI‑enhanced
    if (intent.intent === 'flight_status' && intent.flightCode) {
      const flight = await this.flightsService.getFlightStatus(intent.flightCode);
      if (flight) {
        this.activeSubscriptions[phone] = {
          flight: intent.flightCode,
          lastGate: flight.departure?.gate || flight.arrival?.gate || null,
          lastStatus: flight.flight_status,
        };
        responseText = this.flightsService.formatFlightForWhatsApp(flight);
      } else {
        responseText = `❌ Flight ${intent.flightCode} not found 😔`;
      }
    } 
    else if (intent.intent === 'departures') {
      const flights = await this.flightsService.getDepartures('FCO', 10);
      responseText = this.flightsService.formatDeparturesList(flights);
    }
    else if (intent.intent === 'arrivals') {
      const flights = await this.flightsService.getArrivals('FCO', 10);
      responseText = `🛬 **FCO Arrivals**\n\n${flights.slice(0, 10).map((f, i) => `${i+1}. ${f.flight.iata} from ${f.departure.iata} | ${new Date(f.arrival.scheduled).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}`).join('\n')}`;
    }
    else if (intent.intent === 'greeting') {
      responseText = `👋 **Fiumicino Airport Bot**\n\n✈️ Track flights ("EK509")\n🛫 Departures\n🛬 Arrivals\n\n**What flight?**`;
    }
    else {
      // Fallback to your existing regex logic
      const flightMatch = message.match(/([a-zA-Z]{2}\d{3,5})/i);
      if (flightMatch) {
        const flightIata = flightMatch[1].toUpperCase();
        const flight = await this.flightsService.getFlightStatus(flightIata);
        if (flight) {
          this.activeSubscriptions[phone] = {
            flight: flightIata,
            lastGate: flight.departure?.gate || flight.arrival?.gate || null,
            lastStatus: flight.flight_status,
          };
          responseText = this.flightsService.formatFlightForWhatsApp(flight);
        }
      } else {
        responseText = `🏛️ **Fiumicino Airport Bot**\n\n✈️ Track flight: "EK509"\n🛫 "departures"\n🛬 "arrivals"\n\n**What do you need?**`;
      }
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>${responseText}</Message></Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }
}
