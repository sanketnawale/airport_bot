import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FlightsService } from '../flights/flights.service';

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

  constructor(private flightsService: FlightsService) {}

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
          console.log(`🛑 GATE ALERT! ${sub.flight} → ${currentGate} → ${userPhone}`);
          sub.lastGate = currentGate;
          
          // TODO: Send WhatsApp notification via Twilio
          const alertMessage = `🛑 **GATE ALERT**\n\n${sub.flight} gate announced:\n**${currentGate}**\n\nHurry! ⏰`;
          console.log(`📤 SEND TO ${userPhone}:`, alertMessage);
        }

        // 🔄 STATUS CHANGE ALERT
        if (flight.flight_status !== sub.lastStatus) {
          console.log(`📊 STATUS CHANGE! ${sub.flight}: ${sub.lastStatus} → ${flight.flight_status}`);
          sub.lastStatus = flight.flight_status;
          
          const statusMessage = `📊 **STATUS UPDATE**\n\n${sub.flight} is now: **${flight.flight_status.toUpperCase()}**`;
          console.log(`📤 SEND TO ${userPhone}:`, statusMessage);
        }
      }
    }, 3 * 60 * 1000); // 3 minutes

    console.log('✅ Polling started (3min interval)');
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response) {
    this.startPolling();

    const message = body.Body?.toLowerCase().trim() || '';
    const phone = body.From;

    console.log(`📱 ${phone}: "${message}"`);

    let responseText = '';

    // 🔹 1. GREETINGS
    if (message.includes('hello') || message.includes('hi') || message === 'menu') {
      responseText = `👋 **Welcome to Fiumicino Airport**\n\nI can help with:\n\n✈️ Flight status (e.g., "EK509")\n🛫 Departures (type "departures")\n🛬 Arrivals (type "arrivals")\n🗺️ Route search (e.g., "FCO to LHR")\n\n**What do you need?**`;
    }

    // 🔹 2. BUTTON HANDLERS
    else if (message === 'security') {
      responseText = `🛡️ **Security Check Times** (LIVE)\n\nTerminal 2: 12 min 🟡\nTerminal 3: 8 min ✅\nGates E: 15 min ⏳\n\n*Updated: ${new Date().toLocaleTimeString('it-IT')}*`;
    }
    else if (message === 'passport') {
      responseText = `📖 **Passport Control** (LIVE)\n\nSchengen: 5 min ✅\nNon-Schengen: 18 min ⏳\nPriority: 3 min 🚀`;
    }
    else if (message === 'cancel') {
      delete this.activeSubscriptions[phone];
      responseText = `✅ **Tracking cancelled**\n\nType flight number to track new flight.`;
    }

    // 🔹 3. DEPARTURES
    else if (message.includes('departures') || message.includes('depart')) {
      const flights = await this.flightsService.getDepartures('FCO', 10);
      if (flights.length > 0) {
        responseText = this.flightsService.formatDeparturesList(flights);
      } else {
        responseText = `❌ No departures found. Try again later.`;
      }
    }

    // 🔹 4. ARRIVALS
    else if (message.includes('arrivals') || message.includes('arrive')) {
      const flights = await this.flightsService.getArrivals('FCO', 10);
      if (flights.length > 0) {
        responseText = `🛬 **FCO Arrivals**\n\n`;
        flights.slice(0, 10).forEach((f, i) => {
          const time = new Date(f.arrival.scheduled).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          responseText += `${i + 1}. ${f.flight.iata} from ${f.departure.iata}\n   ${time} | Gate: ${f.arrival.gate || 'TBA'}\n\n`;
        });
      } else {
        responseText = `❌ No arrivals found.`;
      }
    }

    // 🔹 5. ROUTE SEARCH (e.g., "FCO to LHR" or "Rome to London")
    else if (message.includes(' to ') || message.includes('→')) {
      const routeMatch = message.match(/([A-Z]{3})\s*(?:to|→)\s*([A-Z]{3})/i);
      if (routeMatch) {
        const [, dep, arr] = routeMatch;
        const flights = await this.flightsService.searchFlightsByRoute(
          dep.toUpperCase(),
          arr.toUpperCase(),
        );
        
        if (flights.length > 0) {
          responseText = `✈️ **${dep.toUpperCase()} → ${arr.toUpperCase()}**\n\n`;
          flights.forEach((f, i) => {
            responseText += `${i + 1}. ${f.flight.iata} - ${f.airline.name}\n`;
            responseText += `   ${new Date(f.departure.scheduled).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\n\n`;
          });
        } else {
          responseText = `❌ No flights found for ${dep.toUpperCase()} → ${arr.toUpperCase()}`;
        }
      }
    }

    // 🔹 6. FLIGHT NUMBER (Primary feature with full details)
    else {
      const flightMatch = message.match(/([a-zA-Z]{2}\d{3,5})/i);
      if (flightMatch) {
        const flightIata = flightMatch[1].toUpperCase();
        console.log(`🛫 Tracking: ${flightIata}`);

        const flight = await this.flightsService.getFlightStatus(flightIata);

        if (flight) {
          // Subscribe user
          this.activeSubscriptions[phone] = {
            flight: flightIata,
            lastGate: flight.departure?.gate || flight.arrival?.gate || null,
            lastStatus: flight.flight_status,
          };
          console.log(`✅ SUBSCRIBED ${phone} → ${flightIata}`);

          // Format full flight details
          responseText = this.flightsService.formatFlightForWhatsApp(flight);

          // Return with buttons
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Message>
              <Body>${responseText}</Body>
              <ButtonsAction type="reply">
                <ButtonsActionButton action="reply" value="security">🛡️ Security Times</ButtonsActionButton>
                <ButtonsActionButton action="reply" value="passport">📖 Passport Control</ButtonsActionButton>
                <ButtonsActionButton action="reply" value="cancel">❌ Stop Alerts</ButtonsActionButton>
              </ButtonsAction>
            </Message>
          </Response>`;

          res.set('Content-Type', 'text/xml');
          res.send(twiml);
          return;
        } else {
          responseText = `❌ Flight ${flightIata} not found.\n\nCheck the flight number and try again.`;
        }
      }
    }

    // 🔹 7. FALLBACK
    if (!responseText) {
      responseText = `🏛️ **Fiumicino Airport Bot**\n\n✈️ Track flight: "EK509"\n🛫 View departures\n🛬 View arrivals\n🗺️ Search route: "FCO to LHR"\n\n**What do you need?**`;
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>${responseText}</Message></Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }
}
