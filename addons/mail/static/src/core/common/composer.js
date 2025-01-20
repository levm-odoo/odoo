import { AttachmentList } from "@mail/core/common/attachment_list";
import { useAttachmentUploader } from "@mail/core/common/attachment_uploader_hook";
import { useCustomDropzone } from "@web/core/dropzone/dropzone_hook";
import { MailAttachmentDropzone } from "@mail/core/common/mail_attachment_dropzone";
import { MessageConfirmDialog } from "@mail/core/common/message_confirm_dialog";
import { NavigableList } from "@mail/core/common/navigable_list";
import { prettifyMessageContent, isEmpty } from "@mail/utils/common/format";
import { isDragSourceExternalFile } from "@mail/utils/common/misc";
import { rpc } from "@web/core/network/rpc";
import { browser } from "@web/core/browser/browser";
import { useDebounced } from "@web/core/utils/timing";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { closestElement } from "@html_editor/utils/dom_traversal";

import {
    Component,
    markup,
    useChildSubEnv,
    useEffect,
    useRef,
    useState,
    useExternalListener,
    toRaw,
} from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { FileUploader } from "@web/views/fields/file_handler";
import { escape, sprintf } from "@web/core/utils/strings";
import { isDisplayStandalone, isIOS, isMobileOS } from "@web/core/browser/feature_detection";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useComposerActions } from "./composer_actions";
import { CORE_PLUGINS } from "@html_editor/plugin_sets_core_main";
import { PowerboxPlugin } from "@html_editor/main/powerbox/powerbox_plugin";
import { ToolbarPlugin } from "@html_editor/main/toolbar/toolbar_plugin";
import { ShortCutPlugin } from "@html_editor/core/shortcut_plugin";
import { SearchPowerboxPlugin } from "@html_editor/main/powerbox/search_powerbox_plugin";
import { ListPlugin } from "@html_editor/main/list/list_plugin";
import { LinkPlugin } from "@html_editor/main/link/link_plugin";
import { InlineCodePlugin } from "@html_editor/main/inline_code";
import { TabulationPlugin } from "@html_editor/main/tabulation_plugin";
import { SuggestionPlugin } from "./suggestion/suggestion_plugin";
import { ComposerPlugin } from "./composer_plugin";
import { HintPlugin } from "@html_editor/main/hint_plugin";
import { fixInvalidHTML } from "@html_editor/utils/sanitize";
import { ColorPlugin } from "@html_editor/main/font/color_plugin";
import { EmojiPlugin } from "@html_editor/main/emoji_plugin";

const EDIT_CLICK_TYPE = {
    CANCEL: "cancel",
    SAVE: "save",
};

/**
 * @typedef {Object} Props
 * @property {import("models").Composer} composer
 * @property {import("@mail/utils/common/hooks").MessageToReplyTo} messageToReplyTo
 * @property {import("@mail/utils/common/hooks").MessageEdition} [messageEdition]
 * @property {'compact'|'normal'|'extended'} [mode] default: 'normal'
 * @property {'message'|'note'|false} [type] default: false
 * @property {string} [placeholder]
 * @property {string} [className]
 * @property {function} [onDiscardCallback]
 * @property {function} [onPostCallback]
 * @property {number} [autofocus]
 * @property {import("@web/core/utils/hooks").Ref} [dropzoneRef]
 * @extends {Component<Props, Env>}
 */
export class Composer extends Component {
    static components = {
        AttachmentList,
        Dropdown,
        DropdownItem,
        FileUploader,
        NavigableList,
        Wysiwyg,
    };
    static defaultProps = {
        mode: "normal",
        className: "",
        sidebar: true,
        showFullComposer: true,
        allowUpload: true,
    };
    static props = [
        "composer",
        "autofocus?",
        "messageToReplyTo?",
        "onCloseFullComposerCallback?",
        "onDiscardCallback?",
        "onPostCallback?",
        "mode?",
        "placeholder?",
        "dropzoneRef?",
        "messageEdition?",
        "className?",
        "sidebar?",
        "type?",
        "showFullComposer?",
        "allowUpload?",
    ];
    static template = "mail.Composer";

    setup() {
        super.setup();
        this.isMobileOS = isMobileOS();
        this.isIosPwa = isIOS() && isDisplayStandalone();
        this.composerActions = useComposerActions();
        this.OR_PRESS_SEND_KEYBIND = markup(
            _t("or press %(send_keybind)s", {
                send_keybind: this.sendKeybinds
                    .map((key) => `<samp>${escape(key)}</samp>`)
                    .join(" + "),
            })
        );
        this.store = useService("mail.store");
        this.attachmentUploader = useAttachmentUploader(
            this.thread ?? this.props.composer.message.thread,
            { composer: this.props.composer }
        );
        this.ui = useService("ui");
        this.pickerContainerRef = useRef("picker-container");
        this.state = useState({ active: true });
        this.onDropFile = this.onDropFile.bind(this);
        this.saveContentDebounced = useDebounced(this.saveContent, 5000, {
            execBeforeUnmount: true,
        });
        useExternalListener(window, "beforeunload", this.saveContent.bind(this));
        useExternalListener(
            window,
            "click",
            (ev) => {
                if (
                    this.ui.isSmall &&
                    this.composerActions.activePicker &&
                    this.pickerContainerRef.el &&
                    ev.target !== this.pickerContainerRef.el &&
                    !this.pickerContainerRef.el.contains(ev.target)
                ) {
                    this.composerActions.activePicker.close?.();
                }
            },
            { capture: true }
        );
        if (this.props.dropzoneRef) {
            useCustomDropzone(
                this.props.dropzoneRef,
                MailAttachmentDropzone,
                {
                    extraClass: "o-mail-Composer-dropzone",
                    onDrop: this.onDropFile,
                },
                () => this.allowUpload
            );
        }
        if (this.props.messageEdition) {
            this.props.messageEdition.composerOfThread = this;
        }
        useChildSubEnv({ inComposer: true });
        useEffect(
            (focus) => {
                if (focus && this.wysiwyg.editor) {
                    this.wysiwyg.editor.shared.selection.focusEditable();
                }
            },
            () => [this.props.autofocus + this.props.composer.autofocus, this.props.placeholder]
        );
        useEffect(
            (rThread, cThread) => {
                if (cThread && cThread.eq(rThread)) {
                    this.props.composer.autofocus++;
                }
            },
            () => [this.props.messageToReplyTo?.thread, this.props.composer.thread]
        );
        this.wysiwyg = {
            config: {
                content: "<p><br></p>",
                placeholder: this.placeholder,
                disableVideo: true,
                Plugins: this.plugins,
                classList: ["o-mail-Composer-input"],
                onChange: this.onChange.bind(this),
                onBlur: this.onBlurWysiwyg.bind(this),
                onEditorReady: () => {
                    this.historySavePointRestore =
                        this.wysiwyg.editor.shared.history.makeSavePoint();
                    if (this.props.composer.text) {
                        const content = fixInvalidHTML(this.props.composer.text);
                        if (!isEmpty(content)) {
                            this.wysiwyg.editor.editable.innerHTML = content;
                            this.wysiwyg.editor.shared.selection.setCursorEnd(
                                this.wysiwyg.editor.editable
                            );
                            this.wysiwyg.editor.shared.history.addStep();
                        }
                    }
                },
                suggestionService: useService("mail.suggestion"),
                mailServices: {
                    composer: this,
                    attachmentUploader: this.attachmentUploader,
                    onInput: this.onInput.bind(this),
                    onKeydown: this.onKeydown.bind(this),
                    onFocusin: this.onFocusin.bind(this),
                    onFocusout: this.onFocusout.bind(this),
                    store: this.store,
                    orm: this.env.services.orm,
                },
            },
            editor: undefined,
        };
    }

    get plugins() {
        return [
            ...CORE_PLUGINS,
            InlineCodePlugin,
            LinkPlugin,
            ColorPlugin,
            ListPlugin,
            HintPlugin,
            EmojiPlugin,
            ComposerPlugin,
            PowerboxPlugin,
            SearchPowerboxPlugin,
            ShortCutPlugin,
            TabulationPlugin,
            ToolbarPlugin,
            SuggestionPlugin,
        ];
    }

    get areAllActionsDisabled() {
        return false;
    }

    get isMultiUpload() {
        return true;
    }

    get placeholder() {
        if (this.props.placeholder) {
            return this.props.placeholder;
        }
        if (this.thread) {
            if (this.thread.channel_type === "channel") {
                const threadName = this.thread.displayName;
                if (this.thread.parent_channel_id) {
                    return _t(`Message "%(subChannelName)s"`, {
                        subChannelName: threadName,
                    });
                }
                return _t("Message #%(threadName)s…", { threadName });
            }
            return _t("Message %(thread name)s…", { "thread name": this.thread.displayName });
        }
        return "";
    }

    onClickCancelOrSaveEditText(ev) {
        const composer = toRaw(this.props.composer);
        if (composer.message && ev.target.dataset?.type === EDIT_CLICK_TYPE.CANCEL) {
            this.props.onDiscardCallback(ev);
        }
        if (composer.message && ev.target.dataset?.type === EDIT_CLICK_TYPE.SAVE) {
            this.editMessage(ev);
        }
    }

    get CANCEL_OR_SAVE_EDIT_TEXT() {
        if (this.ui.isSmall) {
            return markup(
                sprintf(
                    escape(
                        _t(
                            "%(open_button)s%(icon)s%(open_em)sDiscard editing%(close_em)s%(close_button)s"
                        )
                    ),
                    {
                        open_button: `<button class='btn px-1 py-0' data-type="${escape(
                            EDIT_CLICK_TYPE.CANCEL
                        )}">`,
                        close_button: "</button>",
                        icon: `<i class='fa fa-times-circle pe-1' data-type="${escape(
                            EDIT_CLICK_TYPE.CANCEL
                        )}"></i>`,
                        open_em: `<em data-type="${escape(EDIT_CLICK_TYPE.CANCEL)}">`,
                        close_em: "</em>",
                    }
                )
            );
        } else {
            const translation1 = _t(
                "%(open_samp)sEscape%(close_samp)s %(open_em)sto %(open_cancel)scancel%(close_cancel)s%(close_em)s, %(open_samp)sCTRL-Enter%(close_samp)s %(open_em)sto %(open_save)ssave%(close_save)s%(close_em)s"
            );
            const translation2 = _t(
                "%(open_samp)sEscape%(close_samp)s %(open_em)sto %(open_cancel)scancel%(close_cancel)s%(close_em)s, %(open_samp)sEnter%(close_samp)s %(open_em)sto %(open_save)ssave%(close_save)s%(close_em)s"
            );
            return markup(
                sprintf(escape(this.props.mode === "extended" ? translation1 : translation2), {
                    open_samp: "<samp>",
                    close_samp: "</samp>",
                    open_em: "<em>",
                    close_em: "</em>",
                    open_cancel: `<a role="button" href="#" data-type="${escape(
                        EDIT_CLICK_TYPE.CANCEL
                    )}">`,
                    close_cancel: "</a>",
                    open_save: `<a role="button" href="#" data-type="${escape(
                        EDIT_CLICK_TYPE.SAVE
                    )}">`,
                    close_save: "</a>",
                })
            );
        }
    }

    get SEND_TEXT() {
        if (this.props.composer.message) {
            return _t("Save editing");
        }
        return this.props.type === "note" ? _t("Log") : _t("Send");
    }

    get sendKeybinds() {
        return this.props.mode === "extended" ? [_t("CTRL"), _t("Enter")] : [_t("Enter")];
    }

    get showComposerAvatar() {
        return !this.compact && this.props.sidebar;
    }

    get thread() {
        return this.props.messageToReplyTo?.message?.thread ?? this.props.composer.thread ?? null;
    }

    get allowUpload() {
        return this.props.allowUpload;
    }

    get message() {
        return this.props.composer.message ?? null;
    }

    get extraData() {
        return this.thread.rpcParams;
    }

    get isSendButtonDisabled() {
        const attachments = this.props.composer.attachments;
        return (
            !this.state.active ||
            (isEmpty(this.props.composer.text) && attachments.length === 0) ||
            attachments.some(({ uploading }) => Boolean(uploading))
        );
    }

    get hasSuggestions() {
        return Boolean(document.querySelector(".o-overlay-item .overlay"));
    }

    onChange() {
        this.props.composer.text = this.wysiwyg.editor.getContent();
    }

    onBlurWysiwyg() {
        this.props.composer.text = this.wysiwyg.editor.getContent();
    }

    /**
     * @param {Editor} editor
     */
    onLoadWysiwyg(editor) {
        this.wysiwyg.editor = editor;
    }

    onDropFile(ev) {
        if (isDragSourceExternalFile(ev.dataTransfer)) {
            for (const file of ev.dataTransfer.files) {
                this.attachmentUploader.uploadFile(file);
            }
        }
    }

    onCloseFullComposerCallback() {
        if (this.props.onCloseFullComposerCallback) {
            this.props.onCloseFullComposerCallback();
        } else {
            this.thread?.fetchNewMessages();
        }
    }

    onInput(ev) {}

    onKeydown(ev) {
        const composer = toRaw(this.props.composer);
        switch (ev.key) {
            case "ArrowUp":
                if (this.props.messageEdition && isEmpty(composer.text)) {
                    const messageToEdit = composer.thread.lastEditableMessageOfSelf;
                    if (messageToEdit) {
                        this.props.messageEdition.editingMessage = messageToEdit;
                    }
                }
                break;
            case "Enter": {
                const isOverlayOpen = document.querySelector(".o-overlay-item .overlay");
                if (isOverlayOpen) {
                    ev.preventDefault();
                    return;
                }
                const selection = this.wysiwyg.editor.shared.selection.getEditableSelection();
                const isInList = closestElement(selection.anchorNode, "li");
                if (isInList) {
                    return;
                }
                const shouldPost = this.props.mode === "extended" ? ev.ctrlKey : !ev.shiftKey;
                if (!shouldPost) {
                    return;
                }
                ev.preventDefault(); // to prevent useless return
                if (composer.message) {
                    this.editMessage();
                } else {
                    this.sendMessage();
                }
                break;
            }
            case "Escape":
                if (this.props.onDiscardCallback) {
                    this.props.onDiscardCallback();
                }
                break;
        }
    }

    async onClickFullComposer(ev) {
        if (this.props.type !== "note") {
            // auto-create partners of checked suggested partners
            const newPartners = this.thread.suggestedRecipients.filter(
                (recipient) => recipient.checked && !recipient.persona
            );
            if (newPartners.length !== 0) {
                const recipientEmails = [];
                newPartners.forEach((recipient) => {
                    recipientEmails.push(recipient.email);
                });
                const partners = await rpc("/mail/partner/from_email", {
                    thread_model: this.thread.model,
                    thread_id: this.thread.id,
                    emails: recipientEmails,
                });
                for (const index in partners) {
                    const partnerData = partners[index];
                    const persona = this.store.Persona.insert({ ...partnerData, type: "partner" });
                    const email = recipientEmails[index];
                    const recipient = this.thread.suggestedRecipients.find(
                        (recipient) => recipient.email === email
                    );
                    Object.assign(recipient, { persona });
                }
            }
        }
        const attachmentIds = this.props.composer.attachments.map((attachment) => attachment.id);
        const body = this.props.composer.text;
        const signature = this.store.self.signature;
        const default_body =
            (await prettifyMessageContent(body)) +
            (this.props.composer.emailAddSignature && signature ? "<br>" + signature : "");
        const context = {
            default_attachment_ids: attachmentIds,
            default_body,
            default_email_add_signature: false,
            default_model: this.thread.model,
            default_partner_ids:
                this.props.type === "note"
                    ? []
                    : this.thread.suggestedRecipients
                          .filter((recipient) => recipient.checked)
                          .map((recipient) => recipient.persona.id),
            default_res_ids: [this.thread.id],
            default_subtype_xmlid: this.props.type === "note" ? "mail.mt_note" : "mail.mt_comment",
            // Changed in 18.2+: finally get rid of autofollow, following should be done manually
        };
        const action = {
            name: this.props.type === "note" ? _t("Log note") : _t("Compose Email"),
            type: "ir.actions.act_window",
            res_model: "mail.compose.message",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
            context: context,
        };
        const options = {
            onClose: (...args) => {
                // args === [] : click on 'X' or press escape
                // args === { special: true } : click on 'discard'
                const accidentalDiscard = args.length === 0;
                const isDiscard = accidentalDiscard || args[0]?.special;
                // otherwise message is posted (args === [undefined])
                if (!isDiscard && this.props.composer.thread.model === "mail.box") {
                    this.notifySendFromMailbox();
                }
                if (accidentalDiscard) {
                    const editor = document.querySelector(
                        ".o_mail_composer_form_view .note-editable"
                    );
                    const editorIsEmpty = !editor || !editor.innerText.replace(/^\s*$/gm, "");
                    if (!editorIsEmpty) {
                        this.saveContent();
                        this.restoreContent();
                    }
                } else {
                    this.clear();
                }
                this.props.messageToReplyTo?.cancel();
                this.onCloseFullComposerCallback();
            },
        };
        await this.env.services.action.doAction(action, options);
    }

    clear() {
        this.props.composer.clear();
        this.historySavePointRestore();
        this.historySavePointRestore = this.wysiwyg.editor.shared.history.makeSavePoint();
    }

    notifySendFromMailbox() {
        this.env.services.notification.add(_t('Message posted on "%s"', this.thread.displayName), {
            type: "info",
        });
    }

    isEventTrusted(ev) {
        // Allow patching during tests
        return ev.isTrusted;
    }

    async processMessage(cb) {
        const attachments = this.props.composer.attachments;
        if (attachments.some(({ uploading }) => uploading)) {
            this.env.services.notification.add(_t("Please wait while the file is uploading."), {
                type: "warning",
            });
        } else if (
            !isEmpty(this.props.composer.text) ||
            attachments.length > 0 ||
            (this.message && this.message.attachment_ids.length > 0)
        ) {
            if (!this.state.active) {
                return;
            }
            this.state.active = false;
            await cb(this.props.composer.text);
            if (this.props.onPostCallback) {
                this.props.onPostCallback();
            }
            this.clear();
            this.state.active = true;
        }
    }

    async sendMessage() {
        const composer = toRaw(this.props.composer);
        this.composerActions.activePicker?.close?.();
        if (composer.message) {
            this.editMessage();
            return;
        }
        await this.processMessage(async (value) => {
            await this._sendMessage(value, this.postData, this.extraData);
        });
    }

    get postData() {
        const composer = toRaw(this.props.composer);
        return {
            attachments: composer.attachments || [],
            emailAddSignature: composer.emailAddSignature,
            isNote: this.props.type === "note",
            mentionedChannels: composer.mentionedChannels || [],
            mentionedPartners: composer.mentionedPartners || [],
            cannedResponseIds: composer.cannedResponses.map((c) => c.id),
            parentId: this.props.messageToReplyTo?.message?.id,
        };
    }

    /**
     * @typedef postData
     * @property {import("models").Attachment[]} attachments
     * @property {boolean} isNote
     * @property {number} parentId
     * @property {integer[]} mentionedChannelIds
     * @property {integer[]} mentionedPartnerIds
     */

    /**
     * @param {string} value message body
     * @param {postData} postData Message meta data info
     * @param {extraData} extraData Message extra meta data info needed by other modules
     */
    async _sendMessage(value, postData, extraData) {
        const thread = toRaw(this.props.composer.thread);
        const postThread = toRaw(this.thread);
        const post = postThread.post.bind(postThread, value, postData, extraData);
        if (postThread.model === "discuss.channel") {
            // feature of (optimistic) temp message
            post();
        } else {
            await post();
        }
        if (thread.model === "mail.box") {
            this.notifySendFromMailbox();
        }
        this.props.messageToReplyTo?.cancel();
        this.props.composer.emailAddSignature = true;
    }

    async editMessage() {
        const composer = toRaw(this.props.composer);
        const textContent = new DOMParser().parseFromString(composer.text, "text/html").body
            .textContent;
        if (textContent || composer.message.attachment_ids.length > 0) {
            await this.processMessage(async (value) =>
                composer.message.edit(value, composer.attachments, {
                    mentionedChannels: composer.mentionedChannels,
                    mentionedPartners: composer.mentionedPartners,
                })
            );
        } else {
            this.env.services.dialog.add(MessageConfirmDialog, {
                message: composer.message,
                onConfirm: () => this.message.remove(),
                prompt: _t("Are you sure you want to delete this message?"),
            });
        }
    }

    addEmoji(str) {
        this.wysiwyg.editor.shared.dom.insert(str + "\u00A0");
        this.wysiwyg.editor.shared.history.addStep();
        if (this.ui.isSmall && !this.env.inChatter) {
            return false;
        } else {
            this.wysiwyg.editor.shared.selection.focusEditable();
        }
    }

    onFocusin() {
        const composer = toRaw(this.props.composer);
        composer.isFocused = true;
        composer.thread?.markAsRead({ sync: false });
    }

    onFocusout(ev) {
        if (
            [EDIT_CLICK_TYPE.CANCEL, EDIT_CLICK_TYPE.SAVE].includes(ev.relatedTarget?.dataset?.type)
        ) {
            // Edit or Save most likely clicked: early return as to not re-render (which prevents click)
            return;
        }
        this.props.composer.isFocused = false;
    }

    saveContent() {
        const composer = toRaw(this.props.composer);
        const editable = document.querySelector(".o_mail_composer_form_view .note-editable");
        const config = {};
        if (editable) {
            Object.assign(config, {
                emailAddSignature: false,
                text: editable.innerHTML,
            });
        } else {
            Object.assign(config, {
                emailAddSignature: true,
                text: composer.text,
            });
        }
        browser.localStorage.setItem(composer.localId, JSON.stringify(config));
    }

    restoreContent() {
        const composer = toRaw(this.props.composer);
        try {
            const config = JSON.parse(browser.localStorage.getItem(composer.localId));
            if (config.text) {
                composer.emailAddSignature = config.emailAddSignature;
                composer.text = config.text;
            }
        } catch {
            browser.localStorage.removeItem(composer.localId);
        }
    }
}
