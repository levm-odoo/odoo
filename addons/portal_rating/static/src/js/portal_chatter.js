/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import PortalChatter from "@portal/js/portal_chatter";
import { rpc } from "@web/core/network/rpc";
import { roundPrecision } from "@web/core/utils/numbers";
import { renderToElement } from "@web/core/utils/render";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { parents } from "@web/core/utils/misc";

/**
 * PortalChatter
 *
 * Extends Frontend Chatter to handle rating
 */
PortalChatter.include({
    events: Object.assign({}, PortalChatter.prototype.events, {
        // star based control
        'click .o_website_rating_table_row': '_onClickStarDomain',
        'click .o_website_rating_selection_reset': '_onClickStarDomainReset',
        // publisher comments
        'click .o_wrating_js_publisher_comment_btn': '_onClickPublisherComment',
        'click .o_wrating_js_publisher_comment_edit': '_onClickPublisherComment',
        'click .o_wrating_js_publisher_comment_delete': '_onClickPublisherCommentDelete',
        'click .o_wrating_js_publisher_comment_submit': '_onClickPublisherCommentSubmit',
        'click .o_wrating_js_publisher_comment_cancel': '_onClickPublisherCommentCancel',
    }),
    /**
     * @constructor
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);
        // options
        if (!Object.keys(this.options).includes("display_rating")) {
            this.options = Object.assign({
                'display_rating': false,
                'rating_default_value': 0.0,
            }, this.options);
        }
        // rating card
        this._ratingCardValues = {};
        this._ratingValue = false;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Update the messages format
     *
     * @param {Array<Object>} messages
     * @returns {Array}
     */
    preprocessMessages: function (messages) {
        var self = this;
        messages = this._super.apply(this, arguments);
        if (this.options['display_rating']) {
            messages.forEach((m, i) => {
                m.rating_value = self.roundToHalf(m['rating_value']);
                m.rating = self._preprocessCommentData(m.rating, i);
            });
        }
        // save messages in the widget to process correctly the publisher comment templates
        this.messages = messages;
        return messages;
    },
    /**
     * Round the given value with a precision of 0.5.
     *
     * Examples:
     * - 1.2 --> 1.0
     * - 1.7 --> 1.5
     * - 1.9 --> 2.0
     *
     * @param {Number} value
     * @returns Number
     **/
    roundToHalf: function (value) {
        var converted = parseFloat(value); // Make sure we have a number
        var decimal = (converted - parseInt(converted, 10));
        decimal = Math.round(decimal * 10);
        if (decimal === 5) {
            return (parseInt(converted, 10) + 0.5);
        }
        if ((decimal < 3) || (decimal > 7)) {
            return Math.round(converted);
        } else {
            return (parseInt(converted, 10) + 0.5);
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @returns {Promise}
     */
    _chatterInit: async function () {
        const result = await this._super(...arguments);
        this._updateRatingCardValues(result);
        return result;
    },
    /**
     * @override
     * @returns {Promise}
     */
    messageFetch: async function () {
        const result = await this._super(...arguments);
        this._updateRatingCardValues(result);
        const $prev = this.$('.o_website_rating_card_container');
        $prev.after(renderToElement("portal_rating.rating_card", {widget: this}));
        $prev.remove();
        return result;
    },
    /**
     * Calculates and Updates rating values i.e. average, percentage
     *
     * @private
     */
    _updateRatingCardValues: function (result) {
        if (!result['rating_stats']) {
            return;
        }
        const self = this;
        const ratingData = {
            'avg': Math.round(result['rating_stats']['avg'] * 100) / 100,
            'percent': [],
        };
        Object.keys(result["rating_stats"]["percent"])
            .sort()
            .reverse()
            .forEach((rating) => {
                ratingData["percent"].push({
                    num: self.roundToHalf(rating),
                    percent: roundPrecision(result["rating_stats"]["percent"][rating], 0.01),
                });
            });

        this._ratingCardValues = ratingData;
    },
    /**
     * @override
     */
    _messageFetchPrepareParams: function () {
        var params = this._super.apply(this, arguments);
        if (this.options['display_rating']) {
            params['rating_include'] = true;

            if (this._ratingValue !== false) {
                params['rating_value'] = this._ratingValue;
            }
        }
        return params;
    },
    /**
     * Default rating data for publisher comment qweb template
     * @private
     * @param {Integer} messageIndex
     */
    _newPublisherCommentData: function (messageIndex) {
        return {
            mes_index: messageIndex,
            publisher_id: this.options.partner_id,
            publisher_avatar: `/web/image/res.partner/${this.options.partner_id}/avatar_128/50x50`,
            publisher_name: _t("Write your comment"),
            publisher_datetime: '',
            publisher_comment: '',
        };
    },

     /**
     * preprocess the rating data comming from /website/rating/comment or the chatter_init
     * Can be also use to have new rating data for a new publisher comment
     * @param {JSON} rawRating
     * @returns {JSON} the process rating data
     */
    _preprocessCommentData: function (rawRating, messageIndex) {
        var ratingData = {
            id: rawRating.id,
            mes_index: messageIndex,
            publisher_avatar: rawRating.publisher_avatar,
            publisher_comment: rawRating.publisher_comment,
            publisher_datetime: rawRating.publisher_datetime,
            publisher_id: rawRating.publisher_id,
            publisher_name: rawRating.publisher_name,
        };
        var commentData = {...this._newPublisherCommentData(messageIndex), ...ratingData};
        return commentData;
    },

    /** ---------------
     * Selection of elements for the publisher comment feature
     * Only available from a source in a publisher_comment or publisher_comment_form template
     */

    _getCommentContainer(source) {
        const parentElements = parents(source, ".o_wrating_publisher_container");
        return (
            parentElements.length && parentElements[0].querySelector(".o_wrating_publisher_comment")
        );
    },

    _getCommentButton(source) {
        const parentElements = parents(source, ".o_wrating_publisher_container");
        return (
            parentElements.length && parentElements[0].querySelector(".o_wrating_js_publisher_comment_btn")
        );
    },

    _getCommentTextarea(source) {
        const parentElements = parents(source, ".o_wrating_publisher_container");
        return (
            parentElements.length && parentElements[0].querySelector(".o_portal_rating_comment_input")
        );
    },

    _focusTextComment(source) {
        this._getCommentTextarea(source).focus();
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Show a spinner and hide messages during loading.
     *
     * @override
     * @returns {Promise}
     */
    _changeCurrentPage: function () {
        const spinnerDelayed = setTimeout(()=> {
            this.el.querySelector(".o_portal_chatter_messages_loading").classList.remove("d-none");
            this.el
                .querySelectorAll(".o_portal_chatter_messages")
                .forEach((message) => message.classList.add("d-none"));
        }, 500);
        return this._super.apply(this, arguments).finally(()=>{
            clearTimeout(spinnerDelayed);
            // Hide spinner and show messages
            this.el.querySelector(".o_portal_chatter_messages_loading").classList.add("d-none");
            this.el
                .querySelectorAll(".o_portal_chatter_messages")
                .forEach((message) => message.classList.remove("d-none"));
        });
    },

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickStarDomain: function (ev) {
        const tr = ev.currentTarget;
        const num = tr.getAttribute("data-star");
        this._updateRatingValue(num);
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickStarDomainReset: function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this._updateRatingValue(false);
    },

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickPublisherComment: function (ev) {
        const source = ev.currentTarget;
        // If the form is already present => like cancel remove the form
        if (this._getCommentTextarea(source).length === 1) {
            this._getCommentContainer(source).replaceChild();
            return;
        }
        const messageIndex = parseInt(source.getAttribute("data-mes_index"));
        var data = {is_publisher: this.options['is_user_publisher']};
        data.rating = this._newPublisherCommentData(messageIndex);

        var oldRating = this.messages[messageIndex].rating;
        data.rating.publisher_comment = oldRating.publisher_comment ? oldRating.publisher_comment : '';
        const commentContainer = this._getCommentContainer(source);
        commentContainer.replaceChild();
        commentContainer.appendChild(
            renderToElement("portal_rating.chatter_rating_publisher_form", data)
        );
        this._focusTextComment(source);
    },

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickPublisherCommentDelete: function (ev) {
        var self = this;
        const source = ev.currentTarget;

        const messageIndex = source.getAttribute("data-mes_index");
        var ratingId = this.messages[messageIndex].rating.id;

        this.call("dialog", "add", ConfirmationDialog, {
            title: _t("Delete confirmation"),
            body: _t("Are you sure you want to permanently delete this comment?"),
            confirm: () => {
                rpc("/website/rating/comment", {
                    "rating_id": ratingId,
                    "publisher_comment": "" // Empty publisher comment means no comment
                }).then(function (res) {
                    self.messages[messageIndex].rating = self._preprocessCommentData(res, messageIndex);
                    self._getCommentButton(source).classList.remove("d-none");
                    self._getCommentContainer(source).replaceChild();
                });
            },
            confirmLabel: _t("Delete"),
            cancel: () => {},
            cancelLabel: _t("Discard"),
        });
    },

     /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickPublisherCommentSubmit: function (ev) {
        var self = this;
        const source = ev.currentTarget;

        const messageIndex = parseInt(source.getAttribute("data-mes_index"));
        const comment = this._getCommentTextarea(source).value;
        var ratingId = this.messages[messageIndex].rating.id;

        rpc('/website/rating/comment', {
            "rating_id": ratingId,
            "publisher_comment": comment
        }).then(function (res) {

            // Modify the related message
            self.messages[messageIndex].rating = self._preprocessCommentData(res, messageIndex);
            if (self.messages[messageIndex].rating.publisher_comment !== '') {
                // Remove the button comment if exist and render the comment
                self._getCommentButton(source).classList.add("d-none");
                const commentContainer = self._getCommentContainer(source).replaceChild();
                commentContainer.appendChild(
                    renderToElement("portal_rating.chatter_rating_publisher_comment", {
                        rating: self.messages[messageIndex].rating,
                        is_publisher: self.options.is_user_publisher,
                    })
                );
            } else {
                // Empty string or false considers as no comment
                self._getCommentButton(source).classList.remove("d-none");
                self._getCommentContainer(source).replaceChild();
            }
        });
    },

     /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickPublisherCommentCancel: function (ev) {
        const source = ev.currentTarget;
        const messageIndex = parseInt(source.getAttribute("data-mes_index"));

        var comment = this.messages[messageIndex].rating.publisher_comment;
        const commentContainer = this._getCommentContainer(source);
        commentContainer.replaceChild();
        if (comment) {
            var data = {
                rating: this.messages[messageIndex].rating,
                is_publisher: this.options.is_user_publisher,
            };
            commentContainer.appendChild(
                renderToElement("portal_rating.chatter_rating_publisher_comment", data)
            );
        }
    },

    /**
     * @private
     */
    _updateRatingValue: function (value) {
        this._ratingValue = value;
        this._changeCurrentPage(1);
    },
});
