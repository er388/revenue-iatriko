/**
 * cdnChecker.js - CDN Checker (Stub)
 * TODO: Full implementation
 */

class CDNChecker {
    async checkAll() {
        return {
            status: {},
            offline: false,
            allAvailable: true
        };
    }
    
    showOfflineNotice() {
        console.warn('CDN offline notice');
    }
}

class PeriodicCDNChecker {
    start() {}
    stop() {}
}

export const cdnChecker = new CDNChecker();
export const periodicChecker = new PeriodicCDNChecker();
export default cdnChecker;
