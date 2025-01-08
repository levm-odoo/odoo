import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { renderToElement } from "@web/core/utils/render";

export class CoursePrerequisite extends Interaction {
    static selector = ".o_wslides_js_prerequisite_course";

    start() {
        this.services.popover.add(this.el, {
            trigger: 'focus',
            placement: 'bottom',
            container: 'body',
            html: true,
            content: renderToElement('slide.course.prerequisite', {
                channels: this.el.dataset.channels
            }),
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.course_prerequisite", CoursePrerequisite);
