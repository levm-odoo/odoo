/** @odoo-module **/

import { createElement } from "@web/core/utils/xml";
import { toStringExpression } from "@web/views/utils";
import { toInterpolatedStringExpression, ViewCompiler } from "@web/views/view_compiler";

export class ActivityCompiler extends ViewCompiler {
    /**
     * @override
     */
    compileField(el, params) {
        let compiled;
        if (!el.hasAttribute("widget")) {
            // fields without a specified widget are rendered as simple spans in activity records
            compiled = createElement("div", { "t-out": `record["${el.getAttribute("name")}"].value` });
            if (el.getAttribute("muted")) {
                compiled.classList.add("text-muted");
            }
        } else {
            compiled = super.compileField(el, params);
        }

        const attrs = {};
        for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
        }

        if (el.hasAttribute("widget")) {
            const attrsParts = Object.entries(attrs).map(([key, value]) => {
                if (key.startsWith("t-attf-")) {
                    key = key.slice(7);
                    value = toInterpolatedStringExpression(value);
                } else if (key.startsWith("t-att-")) {
                    key = key.slice(6);
                    value = `"" + (${value})`;
                } else if (key.startsWith("t-att")) {
                    throw new Error("t-att on <field> nodes is not supported");
                } else if (!key.startsWith("t-")) {
                    value = toStringExpression(value);
                }
                return `'${key}':${value}`;
            });
            compiled.setAttribute("attrs", `{${attrsParts.join(",")}}`);
        }

        for (const attr in attrs) {
            if (attr.startsWith("t-") && !attr.startsWith("t-att")) {
                compiled.setAttribute(attr, attrs[attr]);
            }
        }

        return compiled;
    }
}
