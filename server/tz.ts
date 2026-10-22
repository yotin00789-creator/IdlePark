// Everything in this system runs on Thailand time (Asia/Bangkok, UTC+7, no daylight saving),
// whatever timezone the host machine (e.g. a UTC serverless function) is set to.
process.env.TZ = "Asia/Bangkok";
export {};
