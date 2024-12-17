import { markup } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";;
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";
import { session } from "@web/session";
import { scrollTo, closestScrollable } from "@web_editor/js/common/scrolling";
import { loadWysiwygFromTextarea } from "@web_editor/js/frontend/loadWysiwygFromTextarea";
import { FlagMarkAsOffensiveDialog } from "../components/flag_mark_as_offensive/flag_mark_as_offensive";
import { WebsiteForumTagsWrapper } from "../components/website_forum_tags_wrapper";

export class WebsiteForum extends Interaction {
    static selector = ".website_forum";
    dynamicContent = {
        ".karma_required": { "t-on-click": this.onKarmaRequiredClick },
        ".o_js_forum_tag_follow": { "t-on-click": this.onTagFollowClick },
        ".o_wforum_flag:not(.karma_required)": { "t-on-click": this.onFlagAlertClick },
        ".o_wforum_flag_validator": { "t-on-click": this.onFlagValidatorClick },
        ".o_wforum_flag_mark_as_offensive": { "t-on-click": this.onFlagMarkAsOffensiveClick },
        ".vote_up:not(.karma_required), .vote_down:not(.karma_required)": {
            "t-on-click": this.onVotePostClick,
        },
        ".o_wforum_validation_queue a[href*='/validate']": {
            "t-on-click": this.onValidationQueueClick,
        },
        ".o_wforum_validate_toggler:not(.karma_required)": {
            "t-on-click": this.onAcceptAnswerClick,
        },
        ".o_wforum_favourite_toggle": { "t-on-click": this.onFavoriteQuestionClick },
        ".comment_delete:not(.karma_required)": { "t-on-click": this.onDeleteCommentClick },
        ".js_close_intro": { "t-on-click": this.onCloseIntroClick },
        ".answer_collapse": { "t-on-click": this.onExpandAnswerClick },
        ".js_wforum_submit_form:has(.o_wforum_submit_post:not(.karma_required))": {
            "t-on-submit": this.onSubmitForm,
        },
        "#post_reply": { "t-on-shown.bs.collapse": this.onCollapseShown },
        // Not sure this is still needed.
        // float-start class messes up the post layout OPW 769721
        "span[data-oe-model='forum.post'][data-oe-field='content'] img.float-start": {
            "t-att-class": () => ({ "float-start": false }),
        },
    };

    setup() {
        this.lastsearch = [];

        // welcome message action button
        const forumRegisterUrlEl = this.el.querySelector(".forum_register_url");
        if (forumRegisterUrlEl) {
            const forumLogin = `${browser.location.origin}/odoo?redirect=${encodeURIComponent(browser.location.href)}`;
            forumRegisterUrlEl.href = forumLogin;
        }

        // Initialize forum's tooltips
        this.el.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
            const bsTooltip = window.Tooltip.getOrCreateInstance(el);
            this.registerCleanup(() => {
                bsTooltip.dispose();
            });
        });

        this.el.querySelectorAll('[data-bs-toggle="popover"]').forEach((el) => {
            const bsPopover = window.Popover.getOrCreateInstance(el);
            this.registerCleanup(() => {
                bsPopover.dispose();
            });
        });

        const selectMenuWrapperEl = document.querySelector("div.js_select_menu_wrapper");
        if (selectMenuWrapperEl) {
            const isReadOnly = Boolean(selectMenuWrapperEl.dataset.readonly);
            // Take default tags from the input value
            const defaulValue = JSON.parse(selectMenuWrapperEl.dataset.initValue || "[]").map((x) => x.id);

            this.mountComponent(selectMenuWrapperEl, WebsiteForumTagsWrapper, {
                defaulValue: defaulValue,
                disabled: isReadOnly,
            });
        }

        this.el.querySelectorAll("textarea.o_wysiwyg_loader").forEach((textareaEl) => {
            const editorKarma = parseInt(textareaEl.dataset.karma || 0); // default value for backward compatibility
            const formEl = textareaEl.closest("form");
            const hasFullEdit = parseInt(this.el.querySelector("#karma").value) >= editorKarma;
            const options = {
                toolbarTemplate: "website_forum.web_editor_toolbar",
                toolbarOptions: {
                    showColors: false,
                    showFontSize: false,
                    showHistory: true,
                    showHeading1: false,
                    showHeading2: false,
                    showHeading3: false,
                    showLink: hasFullEdit,
                    showImageEdit: hasFullEdit,
                },
                recordInfo: {
                    context: this.services.website_page.context,
                    res_model: "forum.post",
                    // Id is retrieved from URL, which is either:
                    // - /forum/name-1/post/something-5
                    // - /forum/name-1/post/something-5/edit
                    // TODO: Make this more robust.
                    res_id: +browser.location.pathname.split("-").slice(-1)[0].split("/")[0],
                },
                value: textareaEl.getAttribute("content"),
                resizable: true,
                userGeneratedContent: true,
                height: 350,
            };
            options.allowCommandLink = hasFullEdit;
            options.allowCommandImage = hasFullEdit;
            loadWysiwygFromTextarea(this, textareaEl, options).then((wysiwyg) => {
                // float-start class messes up the post layout OPW 769721
                formEl.querySelectorAll(".note-editable img.float-start").forEach((el) => {
                    el.classList.remove("float-start");
                });
            });
        });

        this.el.querySelectorAll(".o_wforum_bio_popover").forEach((authorBox) => {
            const bsPopover = window.Popover.getOrCreateInstance(authorBox, {
                trigger: "hover",
                offset: "10",
                animation: false,
                html: true,
                customClass: "o_wforum_bio_popover_container shadow-sm",
            });
            this.registerCleanup(() => {
                bsPopover.dispose();
            });
        });

        this.el.querySelectorAll(
            ".o_wforum_question, .o_wforum_answer, .o_wforum_post_comment, .o_wforum_last_activity"
        ).forEach((post) => {
            post.querySelector(".o_wforum_relative_datetime").textContent =
                luxon.DateTime.fromSQL(post.dataset.lastActivity, {zone: "utc"}).toRelative();
        });
    }

    /**
     * Check if the user is public, if it's true send a warning alert saying the
     * action cannot be performed.
     *
     * @returns {boolean}
     **/
    warnIfPublicUser() {
        if (session.is_website_user) {
            this.displayAccessDeniedNotification(
                markup(_t('Oh no! Please <a href="%s">sign in</a> to perform this action', "/web/login"))
            );
            return true;
        }
        return false;
    }

    /**
     * @param {string} message
     */
    displayAccessDeniedNotification(message) {
        this.services.notification.add(message, {
            title: _t("Access Denied"),
            sticky: false,
            type: "warning",
        });
    }

    /**
     * @param {Event} ev
     */
    onSubmitForm(ev) {
        let validForm = true;
        const formEl = ev.currentTarget;
        const titleEl = formEl.querySelector("input[name=post_name]");
        const textareaEl = formEl.querySelector("textarea[name=content]");

        if (titleEl?.required) {
            titleEl.classList.toggle("is-invalid", !!titleEl.value);
            validForm = !!titleEl.value;
        }

        // Because the textarea is hidden, we add the red or green border to its
        // container.
        if (textareaEl?.required) {
            const textareaContainerEl = formEl.querySelector(".o_wysiwyg_textarea_wrapper");
            const hasContent = !!textareaContainerEl.innerText.trim() || !!textareaContainerEl.querySelector("img");
            ["border", "border-danger", "rounded-top"].forEach((cls) => {
                textareaContainerEl.classList.toggle(cls, hasContent);
            });
            validForm = hasContent;
        }

        if (validForm) {
            // Stores social share data to display modal on next page.
            if (formEl.querySelector(".oe_social_share_call")) {
                sessionStorage.setItem("social_share", JSON.stringify({
                    targetType: formEl.querySelector(".o_wforum_submit_post").dataset.socialTargetType,
                }));
            }
        } else {
            ev.preventDefault();
            this.waitForTimeout(() => {
                formEl.querySelectorAll('button[type="submit"], a.a-submit').forEach((btnEl) => {
                    btnEl.querySelector("i").remove();
                    btnEl.disabled = false;
                });
            }, 0);
        }
    }

    /**
     * @param {Event} ev
     */
    onExpandAnswerClick(ev) {
        const expandableWindow = ev.currentTarget;
        if (ev.target.matches(".o_wforum_expand_toggle")) {
            expandableWindow.classList.toggle("o_expand")
            expandableWindow.classList.toggle("min-vh-100");
            expandableWindow.classList.toggle("w-lg-50");
        } else if (ev.target.matches(".o_wforum_discard_btn")){
            expandableWindow.classList.remove("o_expand", "min-vh-100");
            expandableWindow.classList.add("w-lg-50");
        }
    }

    /**
     * @param {Event} ev
     */
    onKarmaRequiredClick(ev) {
        const karma = parseInt(ev.currentTarget.dataset.karma);
        if (!karma) {
            return;
        }
        ev.preventDefault();
        if (this.warnIfPublicUser()) {
            return;
        }
        const forumId = parseInt(this.el.ownerDocument.getElementById("wrapwrap").dataset.forum_id);
        const additionalInfoWithForumID = forumId
            ? markup(`<br/>
                <a class="alert-link" href="/forum/${forumId}/faq">
                    ${_t("Read the guidelines to know how to gain karma.")}
                </a>`)
            : "";
        const translatedText = _t("karma is required to perform this action. ");
        const message = markup(`${karma} ${translatedText}${additionalInfoWithForumID}`);
        this.services.notification.add(message, {
            type: "warning",
            sticky: false,
            title: _t("Karma Error"),
        });
    }

    /**
     * @param {Event} ev
     */
    onTagFollowClick(ev) {
        if (ev.target.closest("button")) {
            ev.currentTarget.querySelector(".o_js_forum_tag_link").classList.toggle("text-muted");
        }
    }

    /**
     * @param {Event} ev
     */
    async onFlagAlertClick(ev) {
        ev.preventDefault();
        if (this.warnIfPublicUser()) {
            return;
        }
        const elem = ev.currentTarget;
        const data = await this.waitFor(rpc(
            elem.dataset.href
            || (elem.getAttribute("href") !== "#" && elem.getAttribute("href"))
            || elem.closest("form").getAttribute("action")
        ));
        if (data.error) {
            const message = data.error === "post_already_flagged"
                ? _t("This post is already flagged")
                : data.error === "post_non_flaggable"
                    ? _t("This post can not be flagged")
                    : data.error;
            this.displayAccessDeniedNotification(message);
        } else if (data.success) {
            const child = elem.firstElementChild;
            if (data.success === "post_flagged_moderator") {
                const countFlaggedPosts = this.el.querySelector("#count_posts_queue_flagged");
                elem.innerText = _t(" Flagged");
                elem.prepend(child);
                if (countFlaggedPosts) {
                    countFlaggedPosts.classList.remove("bg-light", "d-none");
                    countFlaggedPosts.classList.add("text-bg-danger");
                    countFlaggedPosts.innerText = parseInt(countFlaggedPosts.innerText, 10) + 1;
                }
            } else if (data.success === "post_flagged_non_moderator") {
                elem.innerText = _t(" Flagged");
                elem.prepend(child);
                const forumAnswerEl = elem.closest(".o_wforum_answer");
                if (forumAnswerEl) {
                    forumAnswerEl.style.height = getComputedStyle(forumAnswerEl).height;
                    forumAnswerEl.classList.add("overflow-hidden");
                    forumAnswerEl.style.transition = "height 1s, opacity 1s";
                    forumAnswerEl.classList.add("opacity-0", "h-0");
                }
            }
        }
    }

    /**
     * @param {Event} ev
     */
    async onVotePostClick(ev) {
        ev.preventDefault();
        if (this.warnIfPublicUser()) {
            return;
        }
        const btnEl = ev.currentTarget;
        const data = await this.waitFor(rpc(btnEl.dataset.href));
        if (data.error) {
            const message = data.error === "own_post"
                ? _t("Sorry, you cannot vote for your own posts")
                : data.error;
            this.displayAccessDeniedNotification(message);
        } else {
            const containerEl = btnEl.closest(".vote");
            const voteUpEl = containerEl.querySelector(".vote_up");
            const voteDownEl = containerEl.querySelector(".vote_down");
            const voteCountEl = containerEl.querySelector(".vote_count");
            const userVote = parseInt(data["user_vote"]);

            voteUpEl.disabled = userVote === 1;
            voteDownEl.disabled = userVote === -1;

            [voteUpEl, voteDownEl, voteCountEl].forEach((el) => {
                el.classList.remove("text-success", "text-danger", "text-muted", "opacity-75", "o_forum_vote_animate");
            });
            void containerEl.offsetWidth; // Force a refresh

            if (userVote === 1) {
                voteUpEl.classList.add("text-success");
                voteCountEl.classList.add("text-success");
                voteDownEl.classList.remove("karma_required");
            }
            if (userVote === -1) {
                voteDownEl.classList.add("text-danger");
                voteCountEl.classList.add("text-danger");
                voteUpEl.classList.remove("karma_required");
            }
            if (userVote === 0) {
                voteCountEl.classList.add("text-muted", "opacity-75");
                if (!voteDownEl.dataset.canDownvote) {
                    voteDownEl.classList.add("karma_required");
                }
                if (!voteUpEl.dataset.canUpvote) {
                    voteUpEl.classList.add("karma_required");
                }
            }
            voteCountEl.innerHTML = data["vote_count"];
            voteCountEl.classList.add("o_forum_vote_animate");
            this.refreshListeners();
        }
    }

    /**
     * Call the route to moderate/validate the post, then hide the validated post
     * and decrement the count in the appropriate queue badge of the sidebar on success.
     *
     * @param {Event} ev
     */
    async onValidationQueueClick(ev) {
        ev.preventDefault();
        const approvalLink = ev.currentTarget;
        const postBeingValidated = approvalLink.closest(".post_to_validate");
        if (!postBeingValidated) {
            return;
        }
        postBeingValidated.classList.add("d-none");
        let ok;
        try {
            ok = (await this.waitFor(fetch(approvalLink.href))).ok;
        } catch {
            // Calling the endpoint like this returns an HTML page. As we can't
            // extract the error message from that, we disregard it and simply
            // restore the post's visibility. This __should__ be improved.
        }
        if (!ok) {
            postBeingValidated.classList.remove("d-none");
            return;
        }
        const nbLeftInQueue = Array.from(document.querySelectorAll(".post_to_validate"))
            .filter(e => window.getComputedStyle(e).display !== "none")
            .length;
        const queueType = document.querySelector("#queue_type").dataset.queueType;
        const queueCountBadge = document.querySelector(`#count_posts_queue_${queueType}`);
        queueCountBadge.innerText = nbLeftInQueue;
        if (!nbLeftInQueue) {
            document.querySelector(".o_caught_up_alert").classList.remove("d-none");
            document.querySelector(".o_wforum_btn_filter_tool")?.classList.add("d-none");
            queueCountBadge.classList.add("d-none");
        }
    }

    /**
     * @param {Event} ev
     */
    async onAcceptAnswerClick(ev) {
        ev.preventDefault();
        if (this.warnIfPublicUser()) {
            return;
        }
        const link = ev.currentTarget;
        const target = link.dataset.target;
        const data = await this.waitFor(rpc(link.dataset.href));
        if (data.error) {
            const message = data.error === "own_post"
                ? _t("Sorry, you cannot select your own posts as best answer")
                : data.error;
            this.displayAccessDeniedNotification(message);
            return;
        }
        for (const answer of document.querySelectorAll(".o_wforum_answer")) {
            const isCorrect = answer.matches(target) ? data : false;
            const toggler = answer.querySelector(".o_wforum_validate_toggler");
            toggler.setAttribute(
                "data-bs-original-title",
                isCorrect ? toggler.dataset.helperDecline : toggler.dataset.helperAccept
            );
            const styleForCorrect = isCorrect ? answer.classList.add : answer.classList.remove;
            const styleForIncorrect = isCorrect ? answer.classList.remove : answer.classList.add;
            styleForCorrect.call(
                answer.classList,
                "o_wforum_answer_correct", "my-2", "mx-n3", "mx-lg-n2", "mx-xl-n3", "py-3", "px-3", "px-lg-2", "px-xl-3"
            );
            styleForIncorrect.call(toggler.classList, "opacity-50");
            const answerBorder = answer.querySelector("div .border-start");
            styleForCorrect.call(answerBorder.classList, "border-success");
            const togglerIcon = toggler.querySelector(".fa");
            styleForCorrect.call(togglerIcon.classList, "fa-check-circle", "text-success");
            styleForIncorrect.call(togglerIcon.classList, "fa-check-circle-o");
            const correctBadge = answer.querySelector(".o_wforum_answer_correct_badge");
            styleForCorrect.call(correctBadge.classList, "d-inline");
            styleForIncorrect.call(correctBadge.classList, "d-none");
        }
    }

    /**
     * @param {Event} ev
     */
    async onFavoriteQuestionClick(ev) {
        ev.preventDefault();
        const link = ev.currentTarget;
        const data = await this.waitFor(rpc(link.dataset.href));
        link.classList.toggle("opacity-50", !data);
        link.classList.toggle("opacity-100-hover", !data);
        const link_icon = link.querySelector(".fa");
        link_icon.classList.toggle("fa-star-o", !data);
        link_icon.classList.toggle("o_wforum_gold", data)
        link_icon.classList.toggle("fa-star", data)
    }

    /**
     * @param {Event} ev
     */
    onDeleteCommentClick(ev) {
        ev.preventDefault();
        if (this.warnIfPublicUser()) {
            return;
        }
        this.services.dialog.add(ConfirmationDialog, {
            body: _t("Are you sure you want to delete this comment?"),
            confirmLabel: _t("Delete"),
            confirm: () => {
                const deleteBtn = ev.currentTarget;
                rpc(deleteBtn.closest("form").attributes.action.value).then(() => {
                    deleteBtn.closest(".o_wforum_post_comment").remove();
                }).catch((error) => {
                    this.services.notification.add(error.data.message, {
                        title: _t("Karma Error"),
                        sticky: false,
                        type: "warning",
                    });
                });
            },
            cancel: () => {},
        });
    }

    /**
     * @param {Event} ev
     */
    onCloseIntroClick(ev) {
        ev.preventDefault();
        cookie.set("forum_welcome_message", false, 24 * 60 * 60 * 365, "optional");
        const forumIntroEl = this.el.querySelector(".forum_intro");
        forumIntroEl.style.height = getComputedStyle(forumIntroEl).height;
        forumIntroEl.classList.add("overflow-hidden");
        forumIntroEl.style.transition = "height 1s";
        forumIntroEl.classList.add("h-0");
        return true;
    }

    /**
     * @param {Event} ev
     */
    async onFlagValidatorClick(ev) {
        ev.preventDefault();
        const currentTarget = ev.currentTarget;
        await this.waitFor(this.services.orm.call("forum.post", currentTarget.dataset.action, [
            parseInt(currentTarget.dataset.postId),
        ]));
        currentTarget.closest(".o_wforum_flag_alert")?.classList.toggle("d-none");
        const flaggedButton = currentTarget.parentElement.firstElementChild,
            child = flaggedButton.firstElementChild,
            countFlaggedPosts = this.el.querySelector("#count_posts_queue_flagged"),
            count = parseInt(countFlaggedPosts.innerText, 10) - 1;

        flaggedButton.innerText = _t(" Flag");
        flaggedButton.prepend(child);
        if (count === 0) {
            countFlaggedPosts.classList.add("bg-light");
        }
        countFlaggedPosts.innerText = count;
    }

    /**
     * @param {Event} ev
     */
    async onFlagMarkAsOffensiveClick(ev) {
        ev.preventDefault();
        const template = await this.waitFor(rpc(ev.currentTarget.dataset.action));
        this.services.dialog.add(FlagMarkAsOffensiveDialog, {
            title: _t("Offensive Post"),
            body: markup(template),
        });
    }

    onCollapseShown(ev) {
        const scrollingElement = closestScrollable(ev.currentTarget.parentNode);
        scrollTo(ev.currentTarget, {
            forcedOffset: scrollingElement.clientHeight - ev.currentTarget.clientHeight,
        });
    }
}

registry.category("public.interactions").add("website_forum.website_forum", WebsiteForum);
