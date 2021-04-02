/** @odoo-module **/
import { browser } from "../../src/core/browser";
import { Registry } from "../../src/core/registry";
import { useHotkey } from "../../src/hotkey/hotkey_hook";
import { hotkeyService } from "../../src/hotkey/hotkey_service";
import { uiService, useActiveElement } from "../../src/services/ui_service";
import { makeTestEnv } from "../helpers/mock_env";
import { getFixture, nextTick, patchWithCleanup, triggerHotkey } from "../helpers/utils";

const { Component, mount, tags } = owl;
const { xml } = tags;

let env;
let target;

QUnit.module("Hotkey Service", {
  async beforeEach() {
    const serviceRegistry = new Registry();
    serviceRegistry.add("hotkey", hotkeyService);
    serviceRegistry.add("ui", uiService);
    env = await makeTestEnv({ serviceRegistry });
    target = getFixture();
  },
});

QUnit.test("register / unregister", async (assert) => {
  assert.expect(2);

  const hotkey = env.services.hotkey;

  const key = "q";
  triggerHotkey(key);
  await nextTick();

  let token = hotkey.registerHotkey(key, () => assert.step(key));
  await nextTick();

  triggerHotkey(key);
  await nextTick();

  hotkey.unregisterHotkey(token);
  triggerHotkey(key);
  await nextTick();

  assert.verifySteps([key]);
});

QUnit.test("data-hotkey", async (assert) => {
  assert.expect(2);

  class MyComponent extends Component {
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const key = "b";
  triggerHotkey(key);
  await nextTick();

  const comp = await mount(MyComponent, { env, target });

  triggerHotkey(key);
  await nextTick();

  comp.unmount();

  triggerHotkey(key);
  await nextTick();

  assert.verifySteps(["click"]);
  comp.destroy();
});

QUnit.test("hook", async (assert) => {
  const key = "q";
  class TestComponent extends Component {
    setup() {
      useHotkey(key, () => assert.step(key));
    }
  }
  TestComponent.template = xml`<div/>`;

  triggerHotkey(key);
  await nextTick();

  const comp = await mount(TestComponent, { env, target });

  triggerHotkey(key);
  await nextTick();

  comp.unmount();

  triggerHotkey(key);
  await nextTick();

  assert.verifySteps([key]);
  comp.destroy();
});

QUnit.test("non-MacOS usability", async (assert) => {
  assert.expect(6);

  patchWithCleanup(browser, {
    navigator: {
      platform: "OdooOS",
    },
  });

  const hotkey = env.services.hotkey;
  const key = "q";

  // On non-MacOS, ALT is NOT replaced by CONTROL key
  let token = hotkey.registerHotkey(key, () => assert.step(key), { altIsOptional: false });
  await nextTick();

  let keydown = new KeyboardEvent("keydown", { key, altKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([key]);

  keydown = new KeyboardEvent("keydown", { key, ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([]);

  hotkey.unregisterHotkey(token);

  // On non-MacOS, CONTROL is NOT replaced by COMMAND key (= metaKey)
  token = hotkey.registerHotkey(`control+${key}`, () => assert.step(`control+${key}`), {
    altIsOptional: true,
  });
  await nextTick();

  keydown = new KeyboardEvent("keydown", { key, ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([`control+${key}`]);

  keydown = new KeyboardEvent("keydown", { key, metaKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([]);

  hotkey.unregisterHotkey(token);
});

QUnit.test("MacOS usability", async (assert) => {
  assert.expect(6);

  patchWithCleanup(browser, {
    navigator: {
      platform: "Mac",
    },
  });

  const hotkey = env.services.hotkey;
  const key = "q";

  // On MacOS, ALT is replaced by CONTROL key
  let token = hotkey.registerHotkey(key, () => assert.step(key), { altIsOptional: false });
  await nextTick();

  let keydown = new KeyboardEvent("keydown", { key, altKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([]);

  keydown = new KeyboardEvent("keydown", { key, ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([key]);

  hotkey.unregisterHotkey(token);

  // On MacOS, CONTROL is replaced by COMMAND key (= metaKey)
  token = hotkey.registerHotkey(`control+${key}`, () => assert.step(`control+${key}`), {
    altIsOptional: true,
  });
  await nextTick();

  keydown = new KeyboardEvent("keydown", { key, ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([]);

  keydown = new KeyboardEvent("keydown", { key, metaKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.verifySteps([`control+${key}`]);

  hotkey.unregisterHotkey(token);
});

QUnit.test("alt is optional parameter", async (assert) => {
  const altIsOptionalKey = "a";
  const altIsRequiredKey = "b";
  const defaultBehaviourKey = "c";
  class TestComponent extends Component {
    setup() {
      useHotkey(altIsOptionalKey, () => assert.step(altIsOptionalKey), { altIsOptional: true });
      useHotkey(altIsRequiredKey, () => assert.step(altIsRequiredKey), { altIsOptional: false });
      useHotkey(defaultBehaviourKey, () => assert.step(defaultBehaviourKey));
    }
  }
  TestComponent.template = xml`<div/>`;

  const comp = await mount(TestComponent, { env, target });

  // Dispatch keys without ALT
  triggerHotkey(altIsOptionalKey, true);
  triggerHotkey(altIsRequiredKey, true);
  triggerHotkey(defaultBehaviourKey, true);
  await nextTick();
  assert.verifySteps([altIsOptionalKey]);

  // Dispatch keys with ALT
  triggerHotkey(altIsOptionalKey, false);
  triggerHotkey(altIsRequiredKey, false);
  triggerHotkey(defaultBehaviourKey, false);
  await nextTick();
  assert.verifySteps([altIsOptionalKey, altIsRequiredKey, defaultBehaviourKey]);

  comp.destroy();
});

QUnit.test("[data-hotkey] alt is required", async (assert) => {
  const key = "a";
  class TestComponent extends Component {
    onClick() {
      assert.step(key);
    }
  }
  TestComponent.template = xml`<div><button t-on-click="onClick" data-hotkey="${key}"/></div>`;

  const comp = await mount(TestComponent, { env, target });

  triggerHotkey(key);
  await nextTick();
  assert.verifySteps([key]);

  triggerHotkey(key, true);
  await nextTick();
  assert.verifySteps([]);

  comp.destroy();
});

QUnit.test("registration allows repeat if specified", async (assert) => {
  assert.expect(6);

  const allowRepeatKey = "a";
  const disallowRepeatKey = "b";
  const defaultBehaviourKey = "c";

  env.services.hotkey.registerHotkey(allowRepeatKey, () => assert.step(allowRepeatKey), {
    allowRepeat: true,
  });
  env.services.hotkey.registerHotkey(disallowRepeatKey, () => assert.step(disallowRepeatKey), {
    allowRepeat: false,
  });
  env.services.hotkey.registerHotkey(defaultBehaviourKey, () => assert.step(defaultBehaviourKey));
  await nextTick();

  // Dispatch the three keys without repeat:
  triggerHotkey(allowRepeatKey);
  triggerHotkey(disallowRepeatKey);
  triggerHotkey(defaultBehaviourKey);
  await nextTick();

  assert.verifySteps([allowRepeatKey, disallowRepeatKey, defaultBehaviourKey]);

  // Dispatch the three keys with repeat:
  triggerHotkey(allowRepeatKey, false, { repeat: true });
  triggerHotkey(disallowRepeatKey, false, { repeat: true });
  triggerHotkey(defaultBehaviourKey, false, { repeat: true });
  await nextTick();

  assert.verifySteps([allowRepeatKey]);
});

QUnit.test("[data-hotkey] never allow repeat", async (assert) => {
  assert.expect(3);
  const key = "a";
  class TestComponent extends Component {
    onClick() {
      assert.step(key);
    }
  }
  TestComponent.template = xml`<div><button t-on-click="onClick" data-hotkey="${key}"/></div>`;

  const comp = await mount(TestComponent, { env, target });

  triggerHotkey(key);
  await nextTick();
  assert.verifySteps([key]);

  triggerHotkey(key, false, { repeat: true });
  await nextTick();
  assert.verifySteps([]);

  comp.destroy();
});

QUnit.test("hotkeys evil 👹", async (assert) => {
  const hotkey = env.services.hotkey;

  assert.throws(function () {
    hotkey.registerHotkey();
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.registerHotkey(null);
  }, /must specify an hotkey/);

  function callback() {}
  assert.throws(function () {
    hotkey.registerHotkey(null, callback);
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.registerHotkey("");
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.registerHotkey("crap", callback);
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.registerHotkey("ctrl+o", callback);
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.registerHotkey("Control+o");
  }, /specify a callback/);
  assert.throws(function () {
    hotkey.registerHotkey("Control+o+d", callback);
  }, /more than one single key part/);
});

QUnit.test("component can register many hotkeys", async (assert) => {
  assert.expect(8);

  class MyComponent extends Component {
    setup() {
      for (const hotkey of ["a", "b", "c"]) {
        useHotkey(hotkey, () => assert.step(`callback:${hotkey}`));
      }
      for (const hotkey of ["d", "e", "f"]) {
        useHotkey(hotkey, () => assert.step(`callback2:${hotkey}`));
      }
    }
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const comp = await mount(MyComponent, { env, target });
  triggerHotkey("a");
  triggerHotkey("b");
  triggerHotkey("c");
  triggerHotkey("d");
  triggerHotkey("e");
  triggerHotkey("f");
  await nextTick();

  assert.verifySteps([
    "callback:a",
    "callback:b",
    "click",
    "callback:c",
    "callback2:d",
    "callback2:e",
    "callback2:f",
  ]);
  comp.destroy();
});

QUnit.test("many components can register same hotkeys", async (assert) => {
  assert.expect(1);

  const result = [];
  const hotkeys = ["a", "b", "c"];

  class MyComponent1 extends Component {
    setup() {
      for (const hotkey of hotkeys) {
        useHotkey(hotkey, () => result.push(`comp1:${hotkey}`));
      }
    }
    onClick() {
      result.push("comp1:click");
    }
  }
  MyComponent1.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  class MyComponent2 extends Component {
    setup() {
      for (const hotkey of hotkeys) {
        useHotkey(hotkey, () => result.push(`comp2:${hotkey}`));
      }
    }
    onClick() {
      result.push("comp2:click");
    }
  }
  MyComponent2.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const comp1 = await mount(MyComponent1, { env, target });
  const comp2 = await mount(MyComponent2, { env, target });
  triggerHotkey("a");
  triggerHotkey("b");
  triggerHotkey("c");
  await nextTick();

  assert.deepEqual(result.sort(), [
    "comp1:a",
    "comp1:b",
    "comp1:c",
    "comp1:click",
    "comp2:a",
    "comp2:b",
    "comp2:c",
    "comp2:click",
  ]);
  comp1.destroy();
  comp2.destroy();
});

QUnit.test("registrations and elements belong to the correct UI owner", async (assert) => {
  assert.expect(7);
  class MyComponent1 extends Component {
    setup() {
      useHotkey("a", () => assert.step("MyComponent1 subscription"));
    }
    onClick() {
      assert.step("MyComponent1 [data-hotkey]");
    }
  }
  MyComponent1.template = xml`<div><button data-hotkey="b" t-on-click="onClick()"/></div>`;

  class MyComponent2 extends Component {
    setup() {
      useHotkey("a", () => assert.step("MyComponent2 subscription"));
      useActiveElement();
    }
    onClick() {
      assert.step("MyComponent2 [data-hotkey]");
    }
  }
  MyComponent2.template = xml`<div><button data-hotkey="b" t-on-click="onClick()"/></div>`;

  const comp1 = await mount(MyComponent1, { env, target });
  triggerHotkey("a");
  triggerHotkey("b");
  await nextTick();

  const comp2 = await mount(MyComponent2, { env, target });
  triggerHotkey("a");
  triggerHotkey("b");
  await nextTick();

  comp2.unmount();
  triggerHotkey("a");
  triggerHotkey("b");
  await nextTick();

  assert.verifySteps([
    "MyComponent1 subscription",
    "MyComponent1 [data-hotkey]",
    "MyComponent2 subscription",
    "MyComponent2 [data-hotkey]",
    "MyComponent1 subscription",
    "MyComponent1 [data-hotkey]",
  ]);

  comp1.destroy();
  comp2.destroy();
});
