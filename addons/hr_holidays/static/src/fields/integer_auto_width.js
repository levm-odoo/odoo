import { registry } from "@web/core/registry";
import { integerField, IntegerField } from "@web/views/fields/integer/integer_field";
import {onMounted} from "@odoo/owl";

const fieldRegistry = registry.category("fields");

class IntegerAutoWidth extends IntegerField {
    static template = "hr_holidays.IntegerAutoWidth"

    setup() {
        super.setup()
        onMounted(async() => this.autoWidth())
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

const integerAutoWidth = { ...integerField, component: IntegerAutoWidth };

fieldRegistry.add("integer_auto_width", integerAutoWidth);
