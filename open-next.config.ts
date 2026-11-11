import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Build-time pages (guide articles) are served from static assets. Data pages render on request.
// If traffic grows, switch to an R2 incremental cache to enable ISR.
export default defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache });
