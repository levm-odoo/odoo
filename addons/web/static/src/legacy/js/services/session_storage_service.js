/** @odoo-module **/

/**
 * This module defines a service to access the sessionStorage object.
 */

import AbstractStorageService from "web.AbstractStorageService";
import * as core from "./core";
import sessionStorage from "web.sessionStorage";

export var SessionStorageService = AbstractStorageService.extend({
    storage: sessionStorage,
});

core.serviceRegistry.add('session_storage', SessionStorageService);
