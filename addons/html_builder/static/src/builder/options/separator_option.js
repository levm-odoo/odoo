import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

class SeparatorOptionPlugin extends Plugin {
    static id = "SeparatorOption";
    resources = {
        builder_options: [
            {
                template: "html_builder.SeparatorOption",
                selector: ".s_hr",
            },
        ],
    };
}
registry.category("website-plugins").add(SeparatorOptionPlugin.id, SeparatorOptionPlugin);
