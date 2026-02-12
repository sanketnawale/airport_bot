import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface FlightDetails {
  flight_date: string;
  flight_status: string;
  departure: {
    airport: string;
    iata: string;
    icao: string;
    terminal: string;
    gate: string;
    delay: number;
    scheduled: string;
    estimated: string;
    actual: string;
  };
  arrival: {
    airport: string;
    iata: string;
    icao: string;
    terminal: string;
    gate: string;
    baggage: string;
    delay: number;
    scheduled: string;
    estimated: string;
    actual: string;
  };
  airline: {
    name: string;
    iata: string;
    icao: string;
  };
  flight: {
    number: string;
    iata: string;
    icao: string;
  };
  aircraft: {
    registration: string;
    iata: string;
    icao: string;
  };
  live: {
    updated: string;
    latitude: number;
    longitude: number;
    altitude: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    is_ground: boolean;
  };
}

@Injectable()
export class FlightsService {
  private apiKey: string;
  private baseUrl = 'http://api.aviationstack.com/v1';

  constructor(
    private config: ConfigService,
    private httpService: HttpService,
  ) {
    this.apiKey = this.config.get('AVIATIONSTACK_API_KEY') || '';
  }

  // ✅ Enhanced: Get full flight details
  async getFlightStatus(flightIata: string): Promise<FlightDetails | null> {
    if (!this.apiKey) {
      console.error('❌ No API key configured');
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flights`, {
          params: {
            access_key: this.apiKey,
            flight_iata: flightIata,
          },
        }),
      );

      const flight = response.data?.data?.[0];
      if (!flight) {
        console.log(`❌ Flight ${flightIata} not found`);
        return null;
      }

      return flight as FlightDetails;
    } catch (error) {
      console.error('❌ Aviationstack API error:', error.message);
      return null;
    }
  }

  // ✅ NEW: Get departures from airport
  async getDepartures(airportIata: string, limit = 10) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flights`, {
          params: {
            access_key: this.apiKey,
            dep_iata: airportIata,
            limit,
          },
        }),
      );
      return response.data?.data || [];
    } catch (error) {
      console.error('❌ Error fetching departures:', error.message);
      return [];
    }
  }

  // ✅ NEW: Get arrivals to airport
  async getArrivals(airportIata: string, limit = 10) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flights`, {
          params: {
            access_key: this.apiKey,
            arr_iata: airportIata,
            limit,
          },
        }),
      );
      return response.data?.data || [];
    } catch (error) {
      console.error('❌ Error fetching arrivals:', error.message);
      return [];
    }
  }

  // ✅ NEW: Search flights by route
  async searchFlightsByRoute(depIata: string, arrIata: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flights`, {
          params: {
            access_key: this.apiKey,
            dep_iata: depIata,
            arr_iata: arrIata,
            limit: 5,
          },
        }),
      );
      return response.data?.data || [];
    } catch (error) {
      console.error('❌ Error searching route:', error.message);
      return [];
    }
  }

  // ✅ NEW: Get airport info
  async getAirportInfo(iataCode: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/airports`, {
          params: {
            access_key: this.apiKey,
            search: iataCode,
          },
        }),
      );
      return response.data?.data?.[0] || null;
    } catch (error) {
      console.error('❌ Error fetching airport info:', error.message);
      return null;
    }
  }

  // ✅ Helper: Format flight for WhatsApp
  formatFlightForWhatsApp(flight: FlightDetails): string {
    const dep = flight.departure;
    const arr = flight.arrival;
    const statusEmoji = {
      scheduled: '🕒',
      active: '✈️',
      landed: '✅',
      cancelled: '❌',
      diverted: '🔄',
      incident: '⚠️',
    };

    const emoji = statusEmoji[flight.flight_status] || '📋';

    let message = `${emoji} **${flight.airline.name} ${flight.flight.iata}**\n`;
    message += `Status: **${flight.flight_status.toUpperCase()}**\n\n`;

    // Departure
    message += `🛫 **Departure:** ${dep.airport} (${dep.iata})\n`;
    if (dep.terminal) message += `   Terminal: ${dep.terminal}\n`;
    if (dep.gate) message += `   🛤️ Gate: **${dep.gate}**\n`;
    else message += `   ⏳ Gate TBA\n`;
    message += `   Scheduled: ${this.formatTime(dep.scheduled)}\n`;
    if (dep.delay) message += `   ⚠️ Delay: ${dep.delay} min\n`;
    if (dep.actual) message += `   Actual: ${this.formatTime(dep.actual)}\n`;

    message += `\n`;

    // Arrival
    message += `🛬 **Arrival:** ${arr.airport} (${arr.iata})\n`;
    if (arr.terminal) message += `   Terminal: ${arr.terminal}\n`;
    if (arr.gate) message += `   Gate: ${arr.gate}\n`;
    if (arr.baggage) message += `   🧳 Baggage: ${arr.baggage}\n`;
    message += `   Scheduled: ${this.formatTime(arr.scheduled)}\n`;
    if (arr.delay) message += `   ⚠️ Delay: ${arr.delay} min\n`;
    if (arr.actual) message += `   Actual: ${this.formatTime(arr.actual)}\n`;

    // Live tracking
    if (flight.live && !flight.live.is_ground) {
      message += `\n📡 **Live Position**\n`;
      message += `   Altitude: ${Math.round(flight.live.altitude)}m\n`;
      message += `   Speed: ${Math.round(flight.live.speed_horizontal)} km/h\n`;
      message += `   📍 [Track on map](https://www.google.com/maps?q=${flight.live.latitude},${flight.live.longitude})\n`;
    }

    // Aircraft
    if (flight.aircraft?.registration) {
      message += `\n✈️ Aircraft: ${flight.aircraft.iata || 'N/A'} (${flight.aircraft.registration})`;
    }

    return message;
  }

  // Helper: Format departure list
  formatDeparturesList(flights: FlightDetails[]): string {
    let message = `🛫 **FCO Departures**\n\n`;
    
    flights.slice(0, 10).forEach((f, i) => {
      const time = this.formatTime(f.departure.scheduled);
      const status = f.flight_status === 'active' ? '✈️' : 
                     f.flight_status === 'cancelled' ? '❌' : '🕒';
      message += `${i + 1}. ${status} ${f.flight.iata} → ${f.arrival.iata}\n`;
      message += `   ${time} | Gate: ${f.departure.gate || 'TBA'}\n\n`;
    });

    return message;
  }

  private formatTime(isoString: string): string {
    if (!isoString) return 'TBA';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
