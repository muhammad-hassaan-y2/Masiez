export class Geofence {
  private radius = 500;
  private centerLat = 33.6;
  private centerLon = 72.9;

  public isInsideGeofence(lat: number, lon: number): boolean {
    const dist = this.calculateDistance(lat, lon, this.centerLat, this.centerLon);
    return dist <= this.radius;
  }

  public distanceToBoundary(lat: number, lon: number): number {
    const dist = this.calculateDistance(lat, lon, this.centerLat, this.centerLon);
    return Math.max(0, this.radius - dist);
  }

  public validateAltitude(alt: number): boolean {
    return alt >= 1 && alt <= 120;
  }

  public getConfig() {
    return { radius: this.radius, centerLat: this.centerLat, centerLon: this.centerLon };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const dLat = (lat2 - lat1) * 111320;
    const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }
}
