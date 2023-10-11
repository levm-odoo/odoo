<<<<<<< HEAD
/* @odoo-module */

import { patchWebsocketWorkerWithCleanup } from "@bus/../tests/helpers/mock_websocket";

import { registry } from "@web/core/registry";
import { makeDeferred } from "@web/../tests/helpers/utils";

// should be enough to decide whether or not notifications/channel
// subscriptions... are received.
const TIMEOUT = 500;
const callbackRegistry = registry.category("mock_server_websocket_callbacks");

/**
 * Returns a deferred that resolves when a websocket subscription is
 * done. If channels are provided, the deferred will only resolve when
 * we subscribe to all of them.
 *
 * @param {...string} [requiredChannels]
 * @returns {import("@web/core/utils/concurrency").Deferred}
 */
export function waitUntilSubscribe(...requiredChannels) {
    const subscribeDeferred = makeDeferred();
    const failTimeout = setTimeout(() => {
        subscribeDeferred.reject(
            new Error(`Waited ${TIMEOUT}ms for ${requiredChannels} subscription.`)
        );
        console.error(`Waited ${TIMEOUT}ms for ${requiredChannels} subscription.`);
    }, TIMEOUT);
    const lastCallback = callbackRegistry.get("subscribe", () => {});
    callbackRegistry.add(
        "subscribe",
        (data) => {
            const { channels } = data;
            lastCallback(data);
            const allChannelsSubscribed = requiredChannels.every((channel) =>
                channels.includes(channel)
            );
            if (allChannelsSubscribed) {
                subscribeDeferred.resolve();
                clearTimeout(failTimeout);
            }
        },
        { force: true }
    );
    return subscribeDeferred;
}

/**
 * Returns a deferred that resolves when the given channel(s) addition/deletion
 * is notified to the websocket worker.
 *
 * @param {string[]} channels
 * @param {object} [options={}]
 * @param {"add"|"delete"} [options.operation="add"]
 *
 * @returns {import("@web/core/utils/concurrency").Deferred} */
export function waitForChannels(channels, { operation = "add" } = {}) {
    const successDeferred = makeDeferred();
    const failTimeout = setTimeout(() => {
        const failMessage = `Waited ${TIMEOUT}ms for ${channels.join(", ")} to be ${
            operation === "add" ? "added" : "deleted"
        }`;
        QUnit.assert.ok(false, failMessage);
        successDeferred.resolve();
    }, TIMEOUT);
    const channelsSeen = new Set();
    patchWebsocketWorkerWithCleanup({
        async [operation === "add" ? "_addChannel" : "_deleteChannel"](client, channel) {
            await super[operation === "add" ? "_addChannel" : "_deleteChannel"](client, channel);
            if (channels.includes(channel)) {
                channelsSeen.add(channel);
            }
            if (channelsSeen.size === channels.length) {
                QUnit.assert.ok(
                    true,
                    `Channel(s) ${channels.join(", ")} ${
                        operation === "add" ? "added" : "deleted"
                    }.`
                );
                successDeferred.resolve();
                clearTimeout(failTimeout);
            }
        },
    });
    return successDeferred;
}

/**
 * @typedef {Object} ExpectedNotificationOptions
 * @property {boolean} [received=true]
 * @typedef {[env: import("@web/env").OdooEnv, notificationType: string, notificationPayload: any, options: ExpectedNotificationOptions]} ExpectedNotification
 */

/**
 * Wait for a notification to be received/not received. Returns
 * a deferred that resolves when the assertion is done.
 *
 * @param {ExpectedNotification} notification
 * @returns {import("@web/core/utils/concurrency").Deferred}
 */
function _waitNotification(notification) {
    const [env, type, payload, { received = true } = {}] = notification;
    const notificationDeferred = makeDeferred();
    const failTimeout = setTimeout(() => {
        QUnit.assert.ok(
            !received,
            `Notification of type "${type}" with payload ${payload} not received.`
        );
        env.services["bus_service"].removeEventListener("notification", callback);
        notificationDeferred.resolve();
    }, TIMEOUT);
    const callback = ({ detail: notifications }) => {
        for (const notification of notifications) {
            if (notification.type !== type) {
                continue;
            }
            if (JSON.stringify(notification.payload) === JSON.stringify(payload)) {
                QUnit.assert.ok(
                    received,
                    `Notification of type "${type}" with payload ${JSON.stringify(
                        payload
                    )} receveived.`
                );
                notificationDeferred.resolve();
                clearTimeout(failTimeout);
                env.services["bus_service"].removeEventListener("notification", callback);
            }
        }
    };
    env.services["bus_service"].addEventListener("notification", callback);
    return notificationDeferred;
}

/**
 * Wait for the expected notifications to be received/not received. Returns
 * a deferred that resolves when the assertion is done.
 *
 * @param {ExpectedNotification[]} expectedNotifications
 * @returns {import("@web/core/utils/concurrency").Deferred}
 */
export function waitNotifications(...expectedNotifications) {
    return Promise.all(
        expectedNotifications.map((expectedNotification) => _waitNotification(expectedNotification))
    );
}

/**
 * Returns a deferred that resolves when an event matching the given type is
 * received.
 *
 * @typedef {"connect"|"disconnect"|"reconnect"|"reconnecting"|"notification"} EventType
 * @param {import("@web/env").OdooEnv} env
 * @param {EventType} eventType
 * @param {object} [options={}]
 * @param {boolean} [options.received=true]
 */
export function waitForEvent(env, eventType, { received = true } = {}) {
    const eventReceivedDeferred = makeDeferred();
    const failTimeout = setTimeout(() => {
        env.services["bus_service"].removeEventListener(eventType, callback);
        QUnit.assert.ok(!received, `Waited ${TIMEOUT}ms for ${eventType} event.`);
        eventReceivedDeferred.resolve();
    }, TIMEOUT);
    const callback = () => {
        env.services["bus_service"].removeEventListener(eventType, callback);
        QUnit.assert.ok(received, `Event of type "${eventType}" received.`);
        eventReceivedDeferred.resolve();
        clearTimeout(failTimeout);
    };
    env.services["bus_service"].addEventListener(eventType, callback);
    return eventReceivedDeferred;
}
||||||| parent of b3d62e0109e (temp)
=======
/* @odoo-module */

import { patchWebsocketWorkerWithCleanup } from "@bus/../tests/helpers/mock_websocket";

import { makeDeferred } from "@web/../tests/helpers/utils";

// should be enough to decide whether or not notifications/channel
// subscriptions... are received.
const TIMEOUT = 500;

/**
 * Returns a deferred that resolves when the given channel(s) addition/deletion
 * is notified to the websocket worker.
 *
 * @param {string[]} channels
 * @param {object} [options={}]
 * @param {"add"|"delete"} [options.operation="add"]
 *
 * @returns {import("@web/core/utils/concurrency").Deferred} */
export function waitForChannels(channels, { operation = "add" } = {}) {
    const successDeferred = makeDeferred();
    const failTimeout = setTimeout(() => {
        const failMessage = `Waited ${TIMEOUT}ms for ${channels.join(", ")} to be ${
            operation === "add" ? "added" : "deleted"
        }`;
        QUnit.assert.ok(false, failMessage);
        successDeferred.resolve();
    }, TIMEOUT);
    const channelsSeen = new Set();
    patchWebsocketWorkerWithCleanup({
        async [operation === "add" ? "_addChannel" : "_deleteChannel"](client, channel) {
            await this._super(client, channel);
            if (channels.includes(channel)) {
                channelsSeen.add(channel);
            }
            if (channelsSeen.size === channels.length) {
                QUnit.assert.ok(
                    true,
                    `Channel(s) ${channels.join(", ")} ${
                        operation === "add" ? "added" : "deleted"
                    }.`
                );
                successDeferred.resolve();
                clearTimeout(failTimeout);
            }
        },
    });
    return successDeferred;
}
>>>>>>> b3d62e0109e (temp)
