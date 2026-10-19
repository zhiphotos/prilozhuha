import { makeToken, readToken } from "./lib/token.js";
process.env.ACCESS_SECRET = "x".repeat(40);
const t = makeToken({ order: "kr-abc-12345678", until: Date.now() + 1000 });
console.log(readToken(t)?.order === "kr-abc-12345678", readToken(t + "x") === null, readToken("kr1.aaa.bbb") === null);
