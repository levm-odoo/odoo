/** @odoo-module */

import wTourUtils from '@website/js/tours/tour_utils';

wTourUtils.registerWebsitePreviewTour('snippet_newsletter_block_with_edit', {
    test: true,
    url: '/',
    edition: true,
}, () => [
    // Put a Newsletter block.
    ...wTourUtils.dragNDrop({
        id: 's_newsletter_block',
        name: 'Newsletter Block',
    }),
    {
        content: 'Wait for the list id to be set.',
        trigger: ':iframe .s_newsletter_block[data-list-id]:not([data-list-id="0"]) .s_newsletter_subscribe_form',
    },
    ...wTourUtils.clickOnSave(),
    // Subscribe to the newsletter.
    {
        trigger: ':iframe .s_newsletter_block input:value("admin@yourcompany.example.com")',
    },
    {
        content: 'Wait for the email to be loaded in the newsletter input',
        trigger: ':iframe .s_newsletter_block .js_subscribe_btn',
        run: "click",
    },
    // Change the link style.
    ...wTourUtils.clickOnEditAndWaitEditMode(),
    {
        content: 'Click on the Subscribe form',
        trigger: ':iframe .s_newsletter_block .s_newsletter_subscribe_form',
        run: "click",
    },
    {
        content: 'Toggle the option to display the Thanks message',
        trigger: 'we-button[data-toggle-thanks-message] we-checkbox',
        run: "click",
    },
    {
        content: 'Click on the Thanks message',
        trigger: ':iframe .s_newsletter_block .js_subscribed_wrap',
        run: "click",
    },
    ...wTourUtils.clickOnSave(),
]);
