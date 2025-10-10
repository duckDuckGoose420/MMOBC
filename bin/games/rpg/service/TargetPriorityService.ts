export enum TargetStatus {
    NEUTRAL = "neutral",
    PRIORITY = "priority",
    BLOCKED = "blocked"
}

export class TargetPriorityService {
    private targetStatuses: Map<number, Map<number, TargetStatus>> = new Map();

    /**
     * Sets the target status for a specific owner-target pair
     */
    setTargetStatus(owner: number, target: number, status: TargetStatus): void {
        if (!this.targetStatuses.has(owner)) {
            this.targetStatuses.set(owner, new Map());
        }
        this.targetStatuses.get(owner)!.set(target, status);
    }

    /**
     * Gets the current target status for a specific owner-target pair
     */
    getTargetStatus(owner: number, target: number): TargetStatus {
        const ownerMap = this.targetStatuses.get(owner);
        if (!ownerMap) return TargetStatus.NEUTRAL;
        return ownerMap.get(target) || TargetStatus.NEUTRAL;
    }

    /**
     * Toggles priority status: NEUTRAL → PRIORITY, PRIORITY → NEUTRAL
     */
    togglePriority(owner: number, target: number): TargetStatus {
        const currentStatus = this.getTargetStatus(owner, target);
        const newStatus = currentStatus === TargetStatus.PRIORITY ? TargetStatus.NEUTRAL : TargetStatus.PRIORITY;
        this.setTargetStatus(owner, target, newStatus);
        return newStatus;
    }

    /**
     * Toggles block status: NEUTRAL → BLOCKED, BLOCKED → NEUTRAL
     */
    toggleBlock(owner: number, target: number): TargetStatus {
        const currentStatus = this.getTargetStatus(owner, target);
        const newStatus = currentStatus === TargetStatus.BLOCKED ? TargetStatus.NEUTRAL : TargetStatus.BLOCKED;
        this.setTargetStatus(owner, target, newStatus);
        return newStatus;
    }

    /**
     * Removes priority status: PRIORITY → NEUTRAL
     */
    removePriority(owner: number, target: number): void {
        if (this.getTargetStatus(owner, target) === TargetStatus.PRIORITY) {
            this.setTargetStatus(owner, target, TargetStatus.NEUTRAL);
        }
    }

    /**
     * Gets all priority targets for an owner
     */
    getPriorityTargets(owner: number): number[] {
        const ownerMap = this.targetStatuses.get(owner);
        if (!ownerMap) return [];

        const priorityTargets: number[] = [];
        for (const [target, status] of ownerMap) {
            if (status === TargetStatus.PRIORITY) {
                priorityTargets.push(target);
            }
        }
        return priorityTargets;
    }

    /**
     * Checks if a target is blocked for an owner
     */
    isBlocked(owner: number, target: number): boolean {
        return this.getTargetStatus(owner, target) === TargetStatus.BLOCKED;
    }

    /**
     * Checks if a target is priority for an owner
     */
    isPriority(owner: number, target: number): boolean {
        return this.getTargetStatus(owner, target) === TargetStatus.PRIORITY;
    }

    /**
     * Clears all statuses for a specific player (as owner and target)
     */
    clearPlayerStatuses(memberNumber: number): void {
        // Remove as owner
        this.targetStatuses.delete(memberNumber);

        // Remove as target from all owners
        for (const [owner, targetMap] of this.targetStatuses) {
            targetMap.delete(memberNumber);
            if (targetMap.size === 0) {
                this.targetStatuses.delete(owner);
            }
        }
    }

    /**
     * Gets all statuses for debugging
     */
    getAllStatuses(): Map<number, Map<number, TargetStatus>> {
        return new Map(this.targetStatuses);
    }
}

