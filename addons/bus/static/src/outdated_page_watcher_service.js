import { browser } from "@web/core/browser/browser";
import { parseDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { session } from "@web/session";

const { DateTime } = luxon;
export const outdatedPageWatcherService = {
    dependencies: ["bus_service", "multi_tab", "notification", "orm"],
    /**
     * @param {import("@web/env").OdooEnv}
     * @param {Partial<import("services").Services>} services
     */
    async start(env, { bus_service, multi_tab, notification, orm }) {
        if (!session.autovacuum_info) {
            return;
        }
        let lastAutovacuumDt = parseDateTime(session.autovacuum_info.lastcall);
        let nextAutovacuumDt = parseDateTime(session.autovacuum_info.nextcall);
        let lastDisconnectDt = null;
        bus_service.addEventListener(
            "disconnect",
            () => (lastDisconnectDt = DateTime.now().toUTC())
        );
        bus_service.addEventListener("reconnect", async () => {
            if (!multi_tab.isOnMainTab() || !lastDisconnectDt) {
                return;
            }
            if (DateTime.now() >= nextAutovacuumDt) {
                const [autovacuum] = await orm.read(
                    "ir.cron",
                    [session.autovacuum_info.id],
                    ["lastcall", "nextcall"]
                );
                lastAutovacuumDt = parseDateTime(autovacuum.lastcall);
                nextAutovacuumDt = parseDateTime(autovacuum.nextcall);
            }
            if (lastDisconnectDt < lastAutovacuumDt) {
                notification.add(
                    _t(
                        "Save your work and refresh to get the latest updates and avoid potential issues."
                    ),
                    {
                        title: _t("The page is out of date"),
                        type: "warning",
                        sticky: true,
                        buttons: [
                            {
                                name: _t("Refresh"),
                                primary: true,
                                onClick: () => {
                                    browser.location.reload();
                                },
                            },
                        ],
                    }
                );
            }
            lastDisconnectDt = null;
        });
    },
};

registry.category("services").add("bus.outdated_page_watcher", outdatedPageWatcherService);
