import { NhostClient } from "@nhost/nhost-js";

const nhost = new NhostClient({
  subdomain: "zggynlwwpraxjmbawiym",
  region: "ap-southeast-1",
});

console.log("Nhost client initialized successfully.");
console.log("Auth methods available:", Object.keys(nhost.auth));
