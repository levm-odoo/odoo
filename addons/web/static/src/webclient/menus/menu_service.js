import { browser } from "../../core/browser/browser";
import { registry } from "../../core/registry";

export const menuService = {
    dependencies: ["action"],
    async start(env) {
        const _fetchMenus = async () => {
            const res = await browser.fetch(`/web/webclient/load_menus`);
            if (!res.ok) {
                throw new Error("Error while fetching menus");
            }
            await new Promise((r) => setTimeout(r, 3000))
            return res.json();
        };

        const menusReady = _fetchMenus();
        let menusData = {};
        menusReady.then((res) => {
            menusData = res;
        });

        function getMenu(menuId) {
            return menusData[menuId];
        }

        let currentAppId;
        async function setCurrentMenu(menu) {
            await menusReady;
            menu = typeof menu === "number" ? getMenu(menu) : menu;
            if (menu && menu.appID !== currentAppId) {
                currentAppId = menu.appID;
                env.bus.trigger("MENUS:APP-CHANGED");
            }
        }

        return {
            menusReady,
            getAll() {
                return Object.values(menusData);
            },
            getApps() {
                return this.getMenu("root")?.children.map((mid) => this.getMenu(mid)) || [];
            },
            getMenu,
            getCurrentApp() {
                if (!currentAppId) {
                    return;
                }
                return this.getMenu(currentAppId);
            },
            getMenuAsTree(menuID) {
                const menu = this.getMenu(menuID);
                if (menu && !menu.childrenTree) {
                    menu.childrenTree = menu.children.map((mid) => this.getMenuAsTree(mid));
                }
                return menu || {};
            },
            async selectMenu(menu) {
                await menusReady;
                menu = typeof menu === "number" ? this.getMenu(menu) : menu;
                if (!menu.actionID) {
                    return;
                }
                await env.services.action.doAction(menu.actionID, {
                    clearBreadcrumbs: true,
                    onActionReady: () => {
                        setCurrentMenu(menu);
                    },
                });
            },
            setCurrentMenu,
            async reload() {
                await menusReady;
                const newMenusData = await _fetchMenus();
                for (const key in menusData) {
                    delete menusData[key];
                }
                Object.assign(menusData, newMenusData);
                env.bus.trigger("MENUS:APP-CHANGED");
            },
        };
    },
};

registry.category("services").add("menu", menuService);
