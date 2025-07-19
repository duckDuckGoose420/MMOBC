import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export class FeedbackService {
    private filePath: string;

    constructor(filename: string = '../data/feedback.log') {
        this.filePath = resolve(__dirname, filename);

        // Ensure directory exists
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Removes everything up to and including the first occurrence of "feedback"
     * (case-insensitive) and trims the rest of the message.
     */
    public cleanMessage(rawMessage: string): string {
        const regex = /^.*?\bfeedback\b\s*/i;
        return rawMessage.replace(regex, '').trim();
    }

    /**
     * Appends the cleaned feedback message to a file, followed by a newline.
     */
    public appendFeedback(rawMessage: string, memberNumber: number, name:string): void {
        const cleaned = this.cleanMessage(rawMessage);

        const now = new Date();
        const timestamp = now.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        appendFileSync(this.filePath, `[${timestamp}]: ${name}[#${memberNumber}] - ${cleaned} \n`, { encoding: 'utf8' });
    }
}
