import { Component } from "@odoo/owl";
import { menusService } from "./MenusService";
import { NotificationManager, notificationService } from "./notifications";
import { Registry } from "./registry";
import { routerService } from "./router";
import { rpcService } from "./rpc";
import { userService } from "./user";
import { Service } from "./services";
import { Type } from "./types";

// Services
//
// Services registered in this registry will be deployed in the env. A component
// can then call the hook 'useService' in init with the name of the service it
// needs.
const serviceRegistry: Registry<Service> = new Registry();

const services = [menusService, notificationService, routerService, rpcService, userService];

for (let service of services) {
  serviceRegistry.add(service.name, service);
}

// Main Components
//
// Components registered in this registry will be rendered inside the root node
// of the webclient.
const mainComponentRegistry: Registry<Type<Component>> = new Registry();

mainComponentRegistry.add("NotificationManager", NotificationManager);

export const registries = {
  Components: mainComponentRegistry,
  services: serviceRegistry,
};

export type Registries = typeof registries;
