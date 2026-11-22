// Scheduled jobs don't run in the demo.
export function onSchedule(_opts: any, handler: any) { return handler; }
