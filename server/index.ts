// Importing the route modules registers them; `handle` serves a Web Request.
import "./tz.js";
import "./routes/auth.js";
import "./routes/profile.js";
import "./routes/users.js";
import "./routes/ledger.js";
import "./routes/system.js";
import "./routes/export.js";

export { handle } from "./http.js";
