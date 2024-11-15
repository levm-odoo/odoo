import { DiskCache } from "@web/core/browser/disk_cache";
import { registry } from "@web/core/registry";
import { session } from "@web/session";

const KEY = "template_cache";

export const diskCacheService = {
    dependencies: [],
    async start() {
        const cache = new DiskCache("cache_service");
        cache.defineTable("version");

        const lastCacheId = session.cache_hashes[KEY];
        const localCacheId = await cache.read("version", KEY);
        if (lastCacheId !== localCacheId) {
            await cache.clearAll();
            await cache.insert("version", lastCacheId, KEY);
        }

        return cache;
    },
};

registry.category("services").add("disk_cache", diskCacheService);
