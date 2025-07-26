class PerformanceMonitor {
  static timers = new Map();
  
  static start(operation) {
    const start = process.hrtime.bigint();
    this.timers.set(operation, start);
    return operation;
  }
  
  static end(operation) {
    const start = this.timers.get(operation);
    if (!start) {
      console.warn(`⚠️ Timer '${operation}' no encontrado`);
      return 0;
    }
    
    const duration = Number(process.hrtime.bigint() - start) / 1000000; // convertir a ms
    console.log(`⏱️ ${operation}: ${duration.toFixed(2)}ms`);
    
    this.timers.delete(operation);
    return duration;
  }
  
  static async measure(operation, fn) {
    const timer = this.start(operation);
    try {
      const result = await fn();
      this.end(timer);
      return result;
    } catch (error) {
      this.end(timer);
      throw error;
    }
  }
}

module.exports = PerformanceMonitor;