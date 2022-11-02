/** @odoo-module **/

import { clear, many, one, Model } from '@mail/model';

Model({
    name: 'EmojiGridViewRowRegistry',
    identifyingMode: 'xor',
    recordMethods: {
        computeNonSearchRows() {
            const value = [];
            let index = 0;
            for (let viewCategory of this.emojiGridViewOwner.emojiPickerViewOwner.categories) {
                value.push({ viewCategory, index });
                index++;
                let currentItems = [];
                for (let emojiInCategory of viewCategory.category.allEmojiInCategoryOfCurrent) {
                    currentItems.push({ emojiOrEmojiInCategory: { emojiInCategory }, index: currentItems.length });
                    if (currentItems.length === this.emojiGridViewOwner.amountOfItemsPerRow) {
                        value.push({ items: currentItems, index });
                        currentItems = [];
                        index++;
                    }
                }
                if (currentItems.length > 0) {
                    value.push({ items: currentItems, index });
                    currentItems = [];
                    index++;
                }
            }
            return value;
        },
        computeSearchRows() {
            if (this.emojiGridViewOwner.emojiPickerViewOwner.currentSearch === "") {
                return clear();
            }
            const emojis = this.messaging.emojiRegistry.allEmojis.filter(this.emojiGridViewOwner._filterEmoji);
            const value = [];
            let index = 0;
            let currentItems = [];
            for (let emoji of emojis) {
                currentItems.push({ emojiOrEmojiInCategory: { emoji }, index: currentItems.length });
                if (currentItems.length === this.emojiGridViewOwner.amountOfItemsPerRow) {
                    value.push({ items: currentItems, index });
                    currentItems = [];
                    index++;
                }
            }
            if (currentItems.length > 0) {
                value.push({ items: currentItems, index });
                currentItems = [];
                index++;
            }
            return value;
        },
    },
    fields: {
        rows: many('EmojiGridRowView', { inverse: 'emojiGridViewRowRegistryOwner',
            compute() {
                if (!this.emojiGridViewOwner) {
                    return clear();
                }
                if (this.emojiGridViewOwnerAsNonSearch) {
                    return this.computeNonSearchRows();
                }
                if (this.emojiGridViewOwnerAsSearch) {
                    return this.computeSearchRows();
                }
                return clear();
            },
            sort: [['smaller-first', 'index']],
        }),
        emojiGridViewOwner: one('EmojiGridView', {
            compute() {
                return this.emojiGridViewOwnerAsNonSearch || this.emojiGridViewOwnerAsSearch;
            },
        }),
        emojiGridViewOwnerAsNonSearch: one('EmojiGridView', { identifying: true, inverse: 'nonSearchRowRegistry' }),
        emojiGridViewOwnerAsSearch: one('EmojiGridView', { identifying: true, inverse: 'searchRowRegistry' }),
    },
});
