import { registry } from "@web/core/registry";
import { floatField, FloatField } from "@web/views/fields/float/float_field";
import {onMounted} from "@odoo/owl";

const fieldRegistry = registry.category("fields");

class FloatWithoutTrailingZeros extends FloatField {
    static template = "hr_holidays.FloatWithoutTrailingZeros"

    setup() {
        super.setup()
        onMounted(async() => this.autoWidth())
    }

    get formattedValue() {
        return super.formattedValue.replace(/\.*0+$/, '');
    }

    autoWidth(){
        let input = document.getElementById(this.props.id)
        if (input == null) return
        input.parentElement.style.width = Math.max(1, input.value.toString().length)+ "ch"
    }

    onFocusOut(){
        super.onFocusOut()
        this.autoWidth()
    }
}

const floatWithoutTrailingZeros = { ...floatField, component: FloatWithoutTrailingZeros };

fieldRegistry.add("float_without_trailing_zeros", floatWithoutTrailingZeros);
