import { Component, onWillDestroy, onWillStart, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Editor } from "@html_editor/editor";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { LazyComponent } from "@web/core/assets";
import { BuilderOverlayPlugin } from "@mysterious_egg/editor/builder_overlay/builder_overlay_plugin";
import { WebsiteSystrayItem } from "./website_systray_item";

export const unslugHtmlDataObject = (repr) => {
    const match = repr && repr.match(/(.+)\((\d+),(.*)\)/);
    if (!match) {
        return null;
    }
    return {
        model: match[1],
        id: match[2] | 0,
    };
};

const BUILDER_PLUGIN = [BuilderOverlayPlugin];

class WebsiteBuilder extends Component {
    static template = "mysterious_egg.WebsiteBuilder";
    static components = { LazyComponent };

    setup() {
        this.orm = useService("orm");
        this.websiteContent = useRef("iframe");

        this.editor = new Editor(
            {
                Plugins: [...MAIN_PLUGINS, ...BUILDER_PLUGIN],
            },
            this.env.services
        );

        onWillStart(async () => {
            const slugCurrentWebsite = await this.orm.call("website", "get_current_website");
            this.backendWebsiteId = unslugHtmlDataObject(slugCurrentWebsite).id;
            this.initialUrl = `/website/force/${encodeURIComponent(this.backendWebsiteId)}`;
        });

        const systrayProps = {
            onNewPage: this.onNewPage.bind(this),
            onEditPage: this.onEditPage.bind(this),
        };

        registry.category("systray")
            .add("website.WebsiteSystrayItem", {Component: WebsiteSystrayItem, props: systrayProps}, { sequence: -100 });
        onWillDestroy(() => {
            registry.category("systray").remove("website.WebsiteSystrayItem");
        })

    }

    onNewPage() {
        console.log("todo: new page");
    }

    onEditPage() {
        console.log("todo: editpage");
    }

    onWebsiteLoaded() {
        this.editor.attachTo(this.websiteContent.el.contentDocument.body);
    }
}

registry.category("actions").add("egg_website_preview", WebsiteBuilder);
