import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PerformanceStats {
    counters: Record<string, number>;
    timers: Record<string, {
        calls: number;
        totalTime: number;
        minTime: number;
        maxTime: number;
        avgTime: number;
    }>;
    lastUpdated: number;
}

export class PerformanceMonitorService {
    private stats: PerformanceStats = {
        counters: {},
        timers: {},
        lastUpdated: Date.now()
    };

    private readonly dataPath = join(__dirname, '../data/performance.json');

    constructor() {
        this.loadStats();
    }

    /**
     * Increment a counter for a specific function/operation
     */
    incrementCounter(key: string): void {
        this.stats.counters[key] = (this.stats.counters[key] || 0) + 1;
        this.stats.lastUpdated = Date.now();
    }

    /**
     * Start timing an operation
     */
    startTimer(key: string): number {
        return performance.now();
    }

    /**
     * End timing an operation and record the duration
     */
    endTimer(key: string, startTime: number): void {
        const duration = performance.now() - startTime;

        if (!this.stats.timers[key]) {
            this.stats.timers[key] = {
                calls: 0,
                totalTime: 0,
                minTime: duration,
                maxTime: duration,
                avgTime: 0
            };
        }

        const timer = this.stats.timers[key];
        timer.calls++;
        timer.totalTime += duration;
        timer.minTime = Math.min(timer.minTime, duration);
        timer.maxTime = Math.max(timer.maxTime, duration);
        timer.avgTime = timer.totalTime / timer.calls;

        this.stats.lastUpdated = Date.now();
    }

    /**
     * Get current performance statistics
     */
    getStats(): PerformanceStats {
        return {
            counters: { ...this.stats.counters },
            timers: { ...this.stats.timers },
            lastUpdated: this.stats.lastUpdated
        };
    }

    /**
     * Save statistics to file
     */
    saveToFile(): void {
        try {
            const data = JSON.stringify(this.stats, null, 2);
            writeFileSync(this.dataPath, data, 'utf8');
        } catch (error) {
            console.error('Failed to save performance stats:', error);
        }
    }

    /**
     * Load statistics from file
     */
    private loadStats(): void {
        try {
            if (existsSync(this.dataPath)) {
                const data = readFileSync(this.dataPath, 'utf8');
                this.stats = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load performance stats:', error);
        }
    }

    /**
     * Reset all statistics
     */
    reset(): void {
        this.stats = {
            counters: {},
            timers: {},
            lastUpdated: Date.now()
        };
    }

    /**
     * Get formatted statistics for display
     */
    getFormattedStats(): string {
        const stats = this.getStats();
        let output = '=== Performance Statistics ===\n\n';

        output += 'Counters:\n';
        for (const [key, value] of Object.entries(stats.counters)) {
            output += `  ${key}: ${value}\n`;
        }

        output += '\nTimers:\n';
        for (const [key, timer] of Object.entries(stats.timers)) {
            output += `  ${key}:\n`;
            output += `    Calls: ${timer.calls}\n`;
            output += `    Total Time: ${timer.totalTime.toFixed(2)}ms\n`;
            output += `    Avg Time: ${timer.avgTime.toFixed(2)}ms\n`;
            output += `    Min Time: ${timer.minTime.toFixed(2)}ms\n`;
            output += `    Max Time: ${timer.maxTime.toFixed(2)}ms\n`;
        }

        output += `\nLast Updated: ${new Date(stats.lastUpdated).toLocaleString()}\n`;

        return output;
    }
}
