import { TagsList } from "@web/core/tags_list/tags_list";
import { onWillUpdateProps } from "@odoo/owl";

export class TagsListWithSequence extends TagsList {
    setup() {
        super.setup();

        onWillUpdateProps((nextProps) => {
            if (nextProps.tags.every((tag) => "sequence" in tag)) {
                nextProps.tags.sort((a, b) => a.sequence - b.sequence);
            }
        });
    }
};
