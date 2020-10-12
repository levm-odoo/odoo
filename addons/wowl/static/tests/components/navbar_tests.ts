import { NavBar } from "../../src/components/navbar/navbar";
import * as QUnit from "qunit";
import {
  click,
  makeMockFetch,
  mount,
  makeFakeRPCService,
  makeTestEnv,
  OdooEnv,
  getFixture,
} from "../helpers/index";
import { MenuData, menusService } from "./../../src/services/menus";
import { actionManagerService } from "./../../src/services/action_manager/action_manager";
import { Registry } from "./../../src/core/registry";
import { Service } from "./../../src/types";
import { Component, tags } from "@odoo/owl";

const { xml } = tags;
let target: HTMLElement;
let env: OdooEnv;
let menus: MenuData;
let services: Registry<Service>;
let browser: Partial<OdooEnv["browser"]>;

QUnit.module("Navbar", {
  async beforeEach() {
    services = new Registry();
    services.add(menusService.name, menusService);
    services.add(actionManagerService.name, actionManagerService);
    services.add("rpc", makeFakeRPCService());
    menus = {
      root: { id: "root", children: [1], name: "root" },
      1: { id: 1, children: [], name: "App0" },
    };
    target = getFixture();
    browser = {
      fetch: makeMockFetch({
        mockFetch(route: string): MenuData | undefined {
          if (route.includes("load_menus")) {
            return menus;
          }
        },
      }),
    };
    env = await makeTestEnv({ browser, services });
  },
});

QUnit.test("can be rendered", async (assert) => {
  const navbar = await mount(NavBar, { env, target });
  assert.containsOnce(navbar.el!, '.o_menu_apps a[role="menuitem"]', "1 app present");
});

QUnit.test("dropdown menu can be toggled", async (assert) => {
  const navbar = await mount(NavBar, { env, target });

  const dropdown = navbar.el!.querySelector<HTMLElement>(".dropdown-menu")!;
  await click(navbar.el!, 'a[data-toggle="dropdown"]');
  assert.hasClass(dropdown, "show");
  await click(navbar.el!, 'a[data-toggle="dropdown"]');
  assert.doesNotHaveClass(dropdown, "show");
});

QUnit.test("navbar can display systray items", async (assert) => {
  class MyItem extends Component {
    static template = xml`<li class="my-item">my item</li>`;
  }

  const item = {
    name: "addon.myitem",
    Component: MyItem,
  };
  env.registries.systray.add(item.name, item);

  await mount(NavBar, { env, target });

  assert.containsOnce(target, "li.my-item");
});
