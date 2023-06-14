/** @odoo-module **/

import { session } from "@web/session";
import { MediaDialog } from "@web_editor/components/media_dialog/media_dialog";
import { VideoSelector } from "@web_editor/components/media_dialog/video_selector";
import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import customColors from "@web_editor/js/editor/custom_colors";
import { localization } from "@web/core/l10n/localization";
import * as OdooEditorLib from "@web_editor/js/editor/odoo-editor/src/OdooEditor";
import { Toolbar } from "@web_editor/js/editor/toolbar";
import { LinkPopoverWidget } from '@web_editor/js/wysiwyg/widgets/link_popover_widget';
import { AltDialog } from '@web_editor/js/wysiwyg/widgets/alt_dialog';
import { ImageCrop } from '@web_editor/js/wysiwyg/widgets/image_crop';

import * as wysiwygUtils from "@web_editor/js/common/wysiwyg_utils";
import weUtils from "web_editor.utils";
import { PeerToPeer } from "@web_editor/js/wysiwyg/PeerToPeer";
import { uniqueId } from "@web/core/utils/functions";
import { groupBy } from "@web/core/utils/arrays";
import { debounce } from "@web/core/utils/timing";
import { registry } from "@web/core/registry";
import { FileViewer } from "@web/core/file_viewer/file_viewer";
import { EmojiPickerWrapper } from '@web_editor/components/emoji_popover/emoji_popover'
import { isMobileOS } from "@web/core/browser/feature_detection";
import { Mutex } from "@web/core/utils/concurrency";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { ConflictDialog } from "./conflict_dialog";
import { getOrCreateLink } from "./widgets/link";
import { LinkTools, shouldUnlink } from '@web_editor/js/wysiwyg/widgets/link_tools';
import { LinkDialog } from "./widgets/link_dialog";
import {
    Component,
    useRef,
    useState,
    onWillStart,
    onMounted,
    onWillDestroy,
    onWillUpdateProps,
    markup,
} from "@odoo/owl";
import { requireWysiwygLegacyModule } from "@web_editor/js/frontend/loader";
import { isCSSColor } from '@web/core/utils/colors';

const OdooEditor = OdooEditorLib.OdooEditor;
const getDeepRange = OdooEditorLib.getDeepRange;
const getInSelection = OdooEditorLib.getInSelection;
const isProtected = OdooEditorLib.isProtected;
const isBlock = OdooEditorLib.isBlock;
const rgbToHex = OdooEditorLib.rgbToHex;
const preserveCursor = OdooEditorLib.preserveCursor;
const closestElement = OdooEditorLib.closestElement;
const setSelection = OdooEditorLib.setSelection;
const endPos = OdooEditorLib.endPos;
const hasValidSelection = OdooEditorLib.hasValidSelection;
const parseHTML = OdooEditorLib.parseHTML;
const closestBlock = OdooEditorLib.closestBlock;
const getRangePosition = OdooEditorLib.getRangePosition;

var id = 0;
const basicMediaSelector = 'img, .fa, .o_image, .media_iframe_video';
// (see isImageSupportedForStyle).
const mediaSelector = basicMediaSelector.split(',').map(s => `${s}:not([data-oe-xpath])`).join(',');

// Time to consider a user offline in ms. This fixes the problem of the
// navigator closing rtc connection when the mac laptop screen is closed.
const CONSIDER_OFFLINE_TIME = 1000;
// Check wether the computer could be offline. This fixes the problem of the
// navigator closing rtc connection when the mac laptop screen is closed.
// This case happens on Mac OS on every browser when the user close it's laptop
// screen. At first, the os/navigator closes all rtc connection, and after some
// times, the os/navigator internet goes offline without triggering an
// offline/online event.
// However, if the laptop screen is open and the connection is properly remove
// (e.g. disconnect wifi), the event is properly triggered.
const CHECK_OFFLINE_TIME = 1000;
const PTP_CLIENT_DISCONNECTED_STATES = [
    'failed',
    'closed',
    'disconnected',
];

// this is a local cache for ice server descriptions
let ICE_SERVERS = null;

let fileViewerId = 0;

export class Wysiwyg extends Component {
    static template = 'web_editor.Wysiwyg';
    static components = { MediaDialog, VideoSelector, Toolbar, LinkTools, ImageCrop };
    static props = {
        options: Object,
        startWysiwyg: { type: Function, optional: true },
        editingValue: { type: String, optional: true },
    };
    elRef = useRef("el");
    toolbarRef = useRef("toolbar");
    imageCropRef = useRef("imageCrop");
    colorPalettesProps = {
        text: useState({
            resetTabCount: 0,
        }),
        background: useState({
            resetTabCount: 0,
        }),
    }
    imageCropProps = useState({
        rpc: this._rpc.bind(this),
        showCount: 0,
        media: undefined,
        mimetype: undefined,
    });
    state = useState({
        linkToolProps: false,
    });

    setup() {
        this.orm = this._useService('orm');
        this.notification = this._useService("notification");
        this.busService = this.env.services.bus_service;

        const getOnColorPicked = (colorType) => {
            return (params) => {
                if (this.hadNonCollapsedSelectionBeforeColorpicker) {
                    this.odooEditor.historyResetLatestComputedSelection(true);
                }
                // Unstash the mutations now that the color is picked.
                this.odooEditor.historyUnstash();
                this._processAndApplyColor(colorType, params.color);
                // Deselect tables so the applied color can be seen
                // without using `!important` (otherwise the selection
                // hides it).
                if (this.odooEditor.deselectTable() && hasValidSelection(this.odooEditor.editable)) {
                    this.odooEditor.document.getSelection().collapseToStart();
                }
                this._updateEditorUI(this.lastMediaClicked && { target: this.lastMediaClicked });
                // colorpicker.off('color_leave');
            };
        }

        const getOnColorHover = (colorType) => {
            return (props) => {
                if (this.hadNonCollapsedSelectionBeforeColorpicker) {
                    this.odooEditor.historyResetLatestComputedSelection(true);
                }
                this.odooEditor.historyPauseSteps();
                try {
                    this._processAndApplyColor(colorType, props.color, true);
                } finally {
                    this.odooEditor.historyUnpauseSteps();
                }
            }
        };

        const colorPaletteCommonOptions = {
            excluded: ['transparent_grayscale'],
            getDocument: ()=> this.props.options.document,
            // $editable: $(this.odooEditor.editable), // Our parent is the root widget, we can't retrieve the editable section from it...
            // selectedColor: selectedColor,
            selectedTab: 'theme-colors',
            withGradients: true,
            onColorLeave: () => {
                this.odooEditor.historyRevertCurrentStep();
            },
            onEnterColorpicker: () => {
                // todo: make it work
                // const $childElement = $dropdown.children('.dropdown-toggle');
                // const dropdownToggle = new Dropdown($childElement);
                // dropdownToggle.hide();
            },

            getArch: this._getColorpickerArch.bind(this),
            getEditableCustomColors: () => {
                if (!this.$editable) {
                    return [];
                }
                return [...this.$editable[0].querySelectorAll('[style*="color"]')].map(el => {
                    return [el.style.color, el.style.backgroundColor];
                }).flat();
            },
        };
        Object.assign(this.colorPalettesProps.text, colorPaletteCommonOptions, {
            onColorPicked: getOnColorPicked('text'),
            onCustomColorPicked: getOnColorPicked('text'),
            onColorHover: getOnColorHover('text'),
        });
        Object.assign(this.colorPalettesProps.background, colorPaletteCommonOptions, {
            onColorPicked: getOnColorPicked('background'),
            onCustomColorPicked: getOnColorPicked('background'),
            onColorHover: getOnColorHover('background'),
        });

        onWillStart(() => {
            this.init();
        });
        onMounted(async () => {
            const div = document.createElement('div');
            div.classList.add('o_default_editable');
            this.elRef.el.append(div);
            this.el = div
            this.$el = $(div);
            this._renderElement();
            if (this.props.startWysiwyg) {
                await this.props.startWysiwyg(this);
            } else {
                await this.startEdition();
            }
        });
        onWillDestroy(() => {
            this.destroy();
        });
        onWillUpdateProps((newProps) => {
            const lastValue = String(this.props.options.value || '');
            const lastRecordInfo = this.props.options.recordInfo;
            const lastCollaborationChannel = this.props.options.collaborationChannel;
            const newValue = String(newProps.options.value || '');
            const newRecordInfo = newProps.options.recordInfo;
            const newCollaborationChannel = newProps.options.collaborationChannel;

            if (
                (
                    stripHistoryIds(newValue) !== stripHistoryIds(newProps.editingValue) &&
                    stripHistoryIds(lastValue) !== stripHistoryIds(newValue)
                ) ||
                    JSON.stringify(lastRecordInfo) !== JSON.stringify(newRecordInfo) ||
                    JSON.stringify(lastCollaborationChannel) !== JSON.stringify(newCollaborationChannel)
                )
            {
                this.resetEditor(newValue, newProps.options);
                this.env.onWysiwygReset && this.env.onWysiwygReset();
            }
        });
    }

    defaultOptions = {
        lang: 'odoo',
        colors: customColors,
        recordInfo: {context: {}},
        document: document,
        allowCommandVideo: true,
        allowCommandImage: true,
        allowCommandLink: true,
        insertParagraphAfterColumns: true,
        onHistoryResetFromSteps: () => {},
        autostart: true,
    }
    init() {
        const options = this.props.options;
        this.id = ++id;
        this.options = this._getEditorOptions(options);
        this.saving_mutex = new Mutex();
        // Keeps track of color palettes per event name.
        this.colorpickers = {};
        this._onDocumentMousedown = this._onDocumentMousedown.bind(this);
        this._onBlur = this._onBlur.bind(this);
        this.customizableLinksSelector = 'a'
            + ':not([data-bs-toggle="tab"])'
            + ':not([data-bs-toggle="collapse"])'
            + ':not([data-bs-toggle="dropdown"])'
            + ':not(.dropdown-item)';
        // navigator.onLine is sometimes a false positive, this._isOnline use
        // more heuristics to bypass the limitation.
        this._isOnline = true;
        this._signalOnline = this._signalOnline.bind(this);
        this.tooltipTimeouts = [];
        Wysiwyg.activeWysiwygs.add(this);
        this._oNotEditableObservers = new Map();
        this._joinPeerToPeer = this._joinPeerToPeer.bind(this);
    }
    /**
     *
     * @override
     */
    async start() {
        // If this widget is started from the OWL legacy component, at the time
        // of start, the $el is not in the document yet. Some instruction in the
        // start rely on the $el being in the document at that time, including
        // code for the collaboration (for adding cursors) or the iframe loading
        // in mass_mailing.
        if (this.options.autostart) {
            return this.startEdition();
        }
    }
    async startEdition() {
        const self = this;

        const options = this.options;

        if (!this.$editable) {
            this.$editable = this.$el;
        }
        if (options.value) {
            this.$editable.html(options.value);
        }
        const initialHistoryId = options.value && this._getInitialHistoryId(options.value);
        this.$editable.data('wysiwyg', this);
        this.$editable.data('oe-model', options.recordInfo.res_model);
        this.$editable.data('oe-id', options.recordInfo.res_id);
        document.addEventListener('mousedown', this._onDocumentMousedown, true);
        this._bindOnBlur();

        this.toolbarEl = this.toolbarRef.el.firstChild;
        this.toolbar$El = $(this.toolbarEl);

        this.imageCropEL = this.imageCropRef.el.firstChild;
        options.document.body.append(this.imageCropEL);

        const powerboxOptions = this._getPowerboxOptions();

        let editorCollaborationOptions;
        if (
            options.collaborationChannel &&
            // Hack: check if mail module is installed.
            session.notification_type
        ) {
            editorCollaborationOptions = this.setupCollaboration(options.collaborationChannel);
            if (this.options.collaborativeTrigger === 'start') {
                this._joinPeerToPeer();
            } else if (this.options.collaborativeTrigger === 'focus') {
                // Wait until editor is focused to join the peer to peer network.
                this.$editable[0].addEventListener('focus', this._joinPeerToPeer);
            }
        }

        const getYoutubeVideoElement = async (url) => {
            const { embed_url: src } = await this._serviceRpc(
                '/web_editor/video_url/data',
                { video_url: url },
            );
            const [savedVideo] = VideoSelector.createElements([{src}]);
            savedVideo.classList.add(...VideoSelector.mediaSpecificClasses);
            return savedVideo;
        };

        this.odooEditor = new OdooEditor(this.$editable[0], Object.assign({
            _t: _t,
            toolbar: this.toolbarEl,
            document: this.options.document,
            autohideToolbar: !!this.options.autohideToolbar,
            isRootEditable: this.options.isRootEditable,
            onPostSanitize: this._setONotEditable.bind(this),
            placeholder: this.options.placeholder,
            powerboxFilters: this.options.powerboxFilters || [],
            showEmptyElementHint: this.options.showEmptyElementHint,
            controlHistoryFromDocument: this.options.controlHistoryFromDocument,
            initialHistoryId,
            getContentEditableAreas: this.options.getContentEditableAreas,
            getReadOnlyAreas: this.options.getReadOnlyAreas,
            getUnremovableElements: this.options.getUnremovableElements,
            defaultLinkAttributes: this.options.userGeneratedContent ? {rel: 'ugc' } : {},
            allowCommandVideo: this.options.allowCommandVideo,
            allowInlineAtRoot: this.options.allowInlineAtRoot,
            getYoutubeVideoElement: getYoutubeVideoElement,
            getContextFromParentRect: options.getContextFromParentRect,
            getPowerboxElement: () => {
                const selection = (this.options.document || document).getSelection();
                if (selection.isCollapsed && selection.rangeCount) {
                    const baseNode = closestElement(selection.anchorNode, 'P, DIV');
                    const fieldContainer = closestElement(selection.anchorNode, '[data-oe-field]');
                    if (!baseNode ||
                        (
                            fieldContainer &&
                            !(
                                fieldContainer.getAttribute('data-oe-field') === 'arch' ||
                                fieldContainer.getAttribute('data-oe-type') === 'html'
                            )
                        )) {
                        return false;
                    }
                    return baseNode;
                }
            },
            isHintBlacklisted: node => {
                return (node.classList && node.classList.contains('nav-item')) || (
                    node.hasAttribute && (
                        node.hasAttribute('data-target') ||
                        node.hasAttribute('data-oe-model')
                    )
                );
            },
            filterMutationRecords: (records) => {
                return records.filter((record) => {
                    return !(
                        (record.target.classList && record.target.classList.contains('o_header_standard')) ||
                        (record.type === 'attributes' && record.attributeName === 'data-last-history-steps')
                    );
                });
            },
            preHistoryUndo: () => {
                this.destroyLinkTools();
            },
            commands: powerboxOptions.commands,
            categories: powerboxOptions.categories,
            plugins: options.editorPlugins,
            direction: options.direction || localization.direction || 'ltr',
            collaborationClientAvatarUrl: `${browser.location.origin}/web/image?model=res.users&field=avatar_128&id=${encodeURIComponent(session.uid)}`,
            renderingClasses: ['o_dirty', 'o_transform_removal', 'oe_edited_link', 'o_menu_loading'],
            dropImageAsAttachment: options.dropImageAsAttachment,
            foldSnippets: !!options.foldSnippets,
        }, editorCollaborationOptions));

        this.odooEditor.addEventListener('contentChanged', function () {
            self.$editable.trigger('content_changed');
        });
        document.addEventListener("mousemove", this._signalOnline, true);
        document.addEventListener("keydown", this._signalOnline, true);
        document.addEventListener("keyup", this._signalOnline, true);
        if (this.odooEditor.document !== document) {
            this.odooEditor.document.addEventListener("mousemove", this._signalOnline, true);
            this.odooEditor.document.addEventListener("keydown", this._signalOnline, true);
            this.odooEditor.document.addEventListener("keyup", this._signalOnline, true);
        }

        this._initialValue = this.getValue();
        const $wrapwrap = $('#wrapwrap');
        if ($wrapwrap.length) {
            $wrapwrap[0].addEventListener('scroll', this.odooEditor.multiselectionRefresh, { passive: true });
            this.$root = this.$root || $wrapwrap;
        }

        this.$editable.on('click', '[data-oe-field][data-oe-sanitize-prevent-edition]', () => {
            this.env.services.dialog.add(AlertDialog, {
                body: _t("Someone with escalated rights previously modified this area, you are therefore not able to modify it yourself."),
            });
        });

        this._observeOdooFieldChanges();
        this.$editable.on(
            'mousedown touchstart',
            '[data-oe-field]',
            function () {
                self.odooEditor.observerUnactive();
                const $field = $(this);
                if (($field.data('oe-type') === "datetime" || $field.data('oe-type') === "date")) {
                    let selector = '[data-oe-id="' + $field.data('oe-id') + '"]';
                    selector += '[data-oe-field="' + $field.data('oe-field') + '"]';
                    selector += '[data-oe-model="' + $field.data('oe-model') + '"]';
                    const $linkedFieldNodes = self.$editable.find(selector).addBack(selector);
                    $linkedFieldNodes.addClass('o_editable_date_field_linked');
                    if (!$field.hasClass('o_editable_date_field_format_changed')) {
                        $linkedFieldNodes.text($field.data('oe-original-with-format'));
                        $linkedFieldNodes.addClass('o_editable_date_field_format_changed');
                        $linkedFieldNodes.filter('.oe_hide_on_date_edit').addClass('d-none');
                        setTimeout(() => {
                            // we might hide the clicked date, focus the one
                            // supposed to be editable
                            Wysiwyg.setRange($linkedFieldNodes.filter(':not(.oe_hide_on_date_edit)')[0]);
                        }, 0);
                    }
                }
                if ($field.attr('contenteditable') !== 'false') {
                    if ($field.data('oe-type') === "monetary") {
                        $field.attr('contenteditable', false);
                        const $currencyValue = $field.find('.oe_currency_value');
                        $currencyValue.attr('contenteditable', true);
                        $currencyValue.one('mouseup touchend', (e) => {
                            $currencyValue.selectContent();
                        });
                    }
                    if ($field.data('oe-type') === "image") {
                        $field.attr('contenteditable', false);
                        $field.find('img').attr('contenteditable', $field.data('oe-readonly') !== 1);
                    }
                    if ($field.is('[data-oe-many2one-id]')) {
                        $field.attr('contenteditable', false);
                    }
                }
                self.odooEditor.observerActive();
            }
        );

        this.$editable.on('click', '.o_image, .media_iframe_video', e => e.preventDefault());
        this.showTooltip = true;
        this.$editable.on('dblclick', mediaSelector, ev => {
            const target = ev.target;
            if (target.isContentEditable || (target.parentElement && target.parentElement.isContentEditable)) {
                this.showTooltip = false;

                if (!isProtected(this.odooEditor.document.getSelection().anchorNode)) {
                    if (this.options.onDblClickEditableMedia && target.nodeName === 'IMG' && target.src) {
                        this.options.onDblClickEditableMedia(ev);
                    } else {
                        this._onDblClickEditableMedia(ev);
                    }
                }
            }
        });

        if (options.snippets) {
            $(this.odooEditor.document.body).addClass('editor_enable');
            this.snippetsMenu = await this._createSnippetsMenuInstance(options);
            await this._insertSnippetMenu();

            this._onBeforeUnload = (event) => {
                if (this.isDirty()) {
                    event.returnValue = _t('This document is not saved!');
                }
            };
            window.addEventListener('beforeunload', this._onBeforeUnload);
        }
        if (this.options.getContentEditableAreas) {
            $(this.options.getContentEditableAreas(this.odooEditor)).find('*').off('mousedown mouseup click');
        }

        // The toolbar must be configured after the snippetMenu is loaded
        // because if snippetMenu is loaded in an iframe, binding of the color
        // buttons must use the jquery loaded in that iframe.
        this._configureToolbar(options);

        $(this.odooEditor.editable).on('mouseup', this._updateEditorUI.bind(this));
        $(this.odooEditor.editable).on('keydown', this._updateEditorUI.bind(this));
        $(this.odooEditor.editable).on('keydown', this._handleShortcuts.bind(this));
        // Ensure the Toolbar always have the correct layout in note.
        this._updateEditorUI();

        this.$root.on('click', (ev) => {
            const $target = $(ev.target).closest('a');

            // Keep popover open if clicked inside it, but not on a button
            if ($(ev.target).parents('.o_edit_menu_popover').length && !$target.length) {
                ev.preventDefault();
            }

            if ($target.is(this.customizableLinksSelector)
                    && $target.is('a')
                    && $target[0].isContentEditable
                    && !$target.attr('data-oe-model')
                    && !$target.find('> [data-oe-model]').length
                    && !$target[0].closest('.o_extra_menu_items')
                    && $target[0].isContentEditable) {
                if (ev.ctrlKey || ev.metaKey) {
                    window.open(ev.target.href, '_blank')
                }
                this.linkPopover = $target.data('popover-widget-initialized');
                if (!this.linkPopover) {
                    // TODO this code is ugly maybe the mutex should be in the
                    // editor root widget / the popover should not depend on
                    // editor panel (like originally intended but...) / ...
                    (async () => {
                        let container;
                        if (this.snippetsMenu) {
                            // Await for the editor panel to be fully updated
                            // as some buttons of the link popover we create
                            // here relies on clicking in that editor panel...
                            await this.snippetsMenu._mutex.exec(() => null);
                            container = this.options.document.getElementById('oe_manipulators');
                        }
                        this.linkPopover = LinkPopoverWidget.createFor({
                            target: $target[0],
                            wysiwyg: this,
                            container,
                            notify: (params) => {
                                this.notification.add(params.message, { type: params.type });
                            },
                        });;
                        $target.data('popover-widget-initialized', this.linkPopover);
                    })();
                }
                $target.focus();
                if ($target.closest('#wrapwrap').length && this.snippetsMenu) {
                    this.toggleLinkTools({
                        forceOpen: true,
                        link: $target[0],
                        shouldFocusUrl: ev.detail !== 1,
                    });
                }
            }
        });

        this._onSelectionChange = this._onSelectionChange.bind(this);
        this.odooEditor.document.addEventListener('selectionchange', this._onSelectionChange);
        this.setCSSVariables(this.snippetsMenu ? this.snippetsMenu.el : this.toolbarEl);

        this.odooEditor.addEventListener('preObserverActive', () => {
            // The setONotEditable will be called right after the
            // editor sanitization (to be right before the historyStep).
            // If any `.o_not_editable` is created while the observer is
            // unactive, now is the time to call `setONotEditable` before the
            // editor could register a mutation.
            this._setONotEditable(this.odooEditor.editable);
        });

        if (this.options.autohideToolbar) {
            if (this.odooEditor.isMobile) {
                $(this.odooEditor.editable).before(this.toolbar$El);
            } else {
                $(document.body).append(this.toolbar$El);
            }
        }
    }
    setupCollaboration(collaborationChannel) {
        const modelName = collaborationChannel.collaborationModelName;
        const fieldName = collaborationChannel.collaborationFieldName;
        const resId = collaborationChannel.collaborationResId;
        const channelName = `editor_collaboration:${modelName}:${fieldName}:${resId}`;

        if (
            !(modelName && fieldName && resId) ||
            Wysiwyg.activeCollaborationChannelNames.has(channelName)
        ) {
            return;
        }

        this._collaborationChannelName = channelName;
        Wysiwyg.activeCollaborationChannelNames.add(channelName);

        const collaborationBusListener = ({ detail: notifications}) => {
            for (const { payload, type } of notifications) {
                if (
                    type === 'editor_collaboration' &&
                    payload.model_name === modelName &&
                    payload.field_name === fieldName &&
                    payload.res_id === resId
                ) {
                    this._peerToPeerLoading.then(() => this.ptp.handleNotification(payload));
                }
            }
        }
        this.busService.addEventListener('notification', collaborationBusListener);
        this.busService.addChannel(this._collaborationChannelName);
        this._collaborationStopBus = () => {
            Wysiwyg.activeCollaborationChannelNames.delete(this._collaborationChannelName);
            this.busService.removeEventListener('notification', collaborationBusListener);
            this.busService.deleteChannel(this._collaborationChannelName);
        }

        // Check wether clientA is before clientB.
        const isClientFirst = (clientA, clientB) => {
            if (clientA.startTime === clientB.startTime) {
                return clientA.id.localeCompare(clientB.id) < 1;
            } else {
                return clientA.startTime < clientB.startTime;
            }
        };
        const rpcMutex = new Mutex();

        this._getNewPtp = () => {
            // Wether or not the history has been sent or received at least once.
            let historySyncAtLeastOnce = false;
            let historySyncFinished = false;
            let historyStepsBuffer = [];

            return new PeerToPeer({
                peerConnectionConfig: { iceServers: this._iceServers },
                currentClientId: this._currentClientId,
                broadcastAll: (rpcData) => {
                    return rpcMutex.exec(async () => {
                        return this._serviceRpc(
                            '/web_editor/bus_broadcast',
                            {
                                model_name: modelName,
                                field_name: fieldName,
                                res_id: resId,
                                bus_data: rpcData,
                            },
                        );
                    });
                },
                onRequest: {
                    get_start_time: () => this._startCollaborationTime,
                    get_client_name: async () => {
                        if (!this._userName) {
                            // todo: test me
                            const [user] = await this.orm.read(
                                'res.users',
                                [session.uid],
                                ['name'],
                            );
                            this._userName = user.name;
                        }
                        return this._userName;
                    },
                    get_client_avatar: () => `${browser.location.origin}/web/image?model=res.users&field=avatar_128&id=${encodeURIComponent(session.uid)}`,
                    get_missing_steps: (params) => this.odooEditor.historyGetMissingSteps(params.requestPayload),
                    get_history_from_snapshot: () => this.odooEditor.historyGetSnapshotSteps(),
                    get_collaborative_selection: () => this.odooEditor.getCurrentCollaborativeSelection(),
                },
                onNotification: async ({ fromClientId, notificationName, notificationPayload }) => {
                    switch (notificationName) {
                        case 'ptp_remove':
                            this.odooEditor.multiselectionRemove(notificationPayload);
                            break;
                        case 'rtc_signal_description':
                            const pc = this.ptp.clientsInfos[fromClientId].peerConnection;
                            if (this._couldBeDisconnected && this._navigatorCheckOnlineWorking && (!pc || pc.connectionState === 'closed')) {
                                this._signalOnline();
                            }
                            break;
                        case 'ptp_disconnect':
                            this.ptp.removeClient(fromClientId);
                            this.odooEditor.multiselectionRemove(fromClientId);
                            break;
                        case 'rtc_data_channel_open': {
                            fromClientId = notificationPayload.connectionClientId;
                            const remoteStartTime = await this.ptp.requestClient(fromClientId, 'get_start_time', undefined, { transport: 'rtc' });
                            this.ptp.clientsInfos[fromClientId].startTime = remoteStartTime;
                            this.ptp.requestClient(fromClientId, 'get_client_name', undefined, { transport: 'rtc' }).then((clientName) => {
                                this.ptp.clientsInfos[fromClientId].clientName = clientName;
                            });
                            this.ptp.requestClient(fromClientId, 'get_client_avatar', undefined, { transport: 'rtc' }).then(clientAvatarUrl => {
                                this.ptp.clientsInfos[fromClientId].clientAvatarUrl = clientAvatarUrl;
                            });

                            if (!historySyncAtLeastOnce) {
                                const localClient = { id: this._currentClientId, startTime: this._startCollaborationTime };
                                const remoteClient = { id: fromClientId, startTime: remoteStartTime };
                                if (isClientFirst(localClient, remoteClient)) {
                                    historySyncAtLeastOnce = true;
                                } else {
                                    const { steps, historyIds } = await this.ptp.requestClient(fromClientId, 'get_history_from_snapshot', undefined, { transport: 'rtc' });
                                    // Ensure that the history hasn't been
                                    // synced by another client before this
                                    // `get_history_from_snapshot` finished.
                                    if (historySyncAtLeastOnce) {
                                        return;
                                    }
                                    const firstStepId = this.odooEditor.historyGetBranchIds()[0];
                                    const staleDocument = !historyIds.includes(firstStepId);
                                    if (staleDocument) {
                                        return false;
                                    }
                                    historySyncAtLeastOnce = true;
                                    this.odooEditor.historyResetFromSteps(steps, historyIds);
                                    const remoteSelection = await this.ptp.requestClient(fromClientId, 'get_collaborative_selection', undefined, { transport: 'rtc' });
                                    if (remoteSelection) {
                                        this.odooEditor.onExternalMultiselectionUpdate(remoteSelection);
                                    }
                                    this.options.onHistoryResetFromSteps();
                                }
                                // In case there are steps received in the meantime, process them.
                                if (historyStepsBuffer.length) {
                                    this.odooEditor.onExternalHistorySteps(historyStepsBuffer);
                                    historyStepsBuffer = [];
                                }
                                historySyncFinished = true;
                            } else {
                                const currentStep = this.odooEditor._historySteps[this.odooEditor._historySteps.length - 1];
                                const remoteSelection = await this.ptp.requestClient(fromClientId, 'get_collaborative_selection', undefined, { transport: 'rtc' });
                                if (remoteSelection) {
                                    this.odooEditor.onExternalMultiselectionUpdate(remoteSelection);
                                }
                                this.ptp.notifyClient(fromClientId, 'oe_history_step', currentStep, { transport: 'rtc' });
                            }
                            break;
                        }
                        case 'oe_history_step':
                            // Avoid race condition where the step is received
                            // before the history has synced at least once.
                            if (historySyncFinished) {
                                this.odooEditor.onExternalHistorySteps([notificationPayload]);
                            } else {
                                historyStepsBuffer.push(notificationPayload);
                            }
                            break;
                        case 'oe_history_set_selection': {
                            const client = this.ptp.clientsInfos[fromClientId];
                            if (!client) {
                                return;
                            }
                            const selection = notificationPayload;
                            selection.clientName = client.clientName;
                            selection.clientAvatarUrl = client.clientAvatarUrl;
                            this.odooEditor.onExternalMultiselectionUpdate(selection);
                            break;
                        }
                    }
                }
            });
        }

        this._currentClientId = this._generateClientId();
        this._startCollaborationTime = new Date().getTime();

        this._checkConnectionChange = () => {
            this._navigatorCheckOnlineWorking = true;
            if (!this.ptp) {
                return;
            }
            if (!navigator.onLine) {
                this._signalOffline();
            } else {
                this._signalOnline();
            }
        };

        window.addEventListener('online', this._checkConnectionChange);
        window.addEventListener('offline', this._checkConnectionChange);

        this._collaborationInterval = setInterval(async () => {
            if (this._offlineTimeout || this.preSavePromise || !this.ptp) {
                return;
            }

            const clientsInfos = Object.values(this.ptp.clientsInfos);
            const couldBeDisconnected =
                Boolean(clientsInfos.length) &&
                clientsInfos.every((x) => PTP_CLIENT_DISCONNECTED_STATES.includes(x.peerConnection.connectionState));

            if (couldBeDisconnected) {
                this._offlineTimeout = setTimeout(() => {
                    this._signalOffline();
                }, CONSIDER_OFFLINE_TIME);
            }
        }, CHECK_OFFLINE_TIME);

        this._peerToPeerLoading = new Promise(async (resolve) => {
            if (!ICE_SERVERS) {
                ICE_SERVERS = await this._serviceRpc('/web_editor/get_ice_servers');
            }
            let iceServers = ICE_SERVERS;
            if (!iceServers.length) {
                iceServers = [
                    {
                        urls: [
                            'stun:stun1.l.google.com:19302',
                            'stun:stun2.l.google.com:19302',
                        ],
                    }
                ];
            }
            this._iceServers = iceServers;

            this.ptp = this._getNewPtp();

            resolve();
        });

        const editorCollaborationOptions = {
            collaborationClientId: this._currentClientId,
            onHistoryStep: (historyStep) => {
                if (!this.ptp) return;
                this.ptp.notifyAllClients('oe_history_step', historyStep, { transport: 'rtc' });
            },
            onCollaborativeSelectionChange: debounce((collaborativeSelection) => {
                if (!this.ptp) return;
                this.ptp.notifyAllClients('oe_history_set_selection', collaborativeSelection, { transport: 'rtc' });
            }, 50),
            onHistoryMissingParentSteps: async ({ step, fromStepId }) => {
                if (!this.ptp) return;
                const missingSteps = await this.ptp.requestClient(
                    step.clientId,
                    'get_missing_steps', {
                        fromStepId: fromStepId,
                        toStepId: step.id
                    },
                    { transport: 'rtc' }
                );
                // If missing steps === -1, it means that either the
                // step.clientId has a stale document or the step.clientId has a
                // snapshot and does not includes the step in its history.
                if (missingSteps === -1 || !missingSteps.length) {
                    console.warn('Editor get_missing_steps result is erroneous.');
                    return;
                }
                this.ptp && this.odooEditor.onExternalHistorySteps(missingSteps.concat([step]));
            },
        };
        if (this.options.postProcessExternalSteps) {
            editorCollaborationOptions.postProcessExternalSteps = this.options.postProcessExternalSteps;
        }
        return editorCollaborationOptions;
    }
    /**
     * @override
     */
    destroy() {
        Wysiwyg.activeWysiwygs.delete(this);
        if (this._collaborationChannelName) {
            Wysiwyg.activeCollaborationChannelNames.delete(this._collaborationChannelName);
        }

        this._stopPeerToPeer();
        document.removeEventListener("mousemove", this._signalOnline, true);
        document.removeEventListener("keydown", this._signalOnline, true);
        document.removeEventListener("keyup", this._signalOnline, true);
        if (this.odooEditor) {
            this.odooEditor.document.removeEventListener("mousemove", this._signalOnline, true);
            this.odooEditor.document.removeEventListener("keydown", this._signalOnline, true);
            this.odooEditor.document.removeEventListener("keyup", this._signalOnline, true);
            this.odooEditor.document.removeEventListener('selectionchange', this._onSelectionChange);
            for (const observer of this._oNotEditableObservers.values()) {
                observer.disconnect();
            }
            this.odooEditor.destroy();
        }
        if (this.snippetsMenu) {
            setTimeout(()=>this.snippetsMenu.destroy());
        }
        // If peer to peer is initializing, wait for properly closing it.
        if (this._peerToPeerLoading) {
            this._peerToPeerLoading.then(()=> {
                this._collaborationStopBus();
                this.ptp.closeAllConnections();
            });
        }
        clearInterval(this._collaborationInterval);
        this.$editable && this.$editable.off('blur', this._onBlur);
        document.removeEventListener('mousedown', this._onDocumentMousedown, true);
        const $body = $(document.body);
        $body.off('mousemove', this.resizerMousemove);
        $body.off('mouseup', this.resizerMouseup);
        const $wrapwrap = $('#wrapwrap');
        if ($wrapwrap.length && this.odooEditor) {
            $('#wrapwrap')[0].removeEventListener('scroll', this.odooEditor.multiselectionRefresh, { passive: true });
        }
        $(this.$root).off('click');
        this.toolbar$El?.remove();
        this.imageCropEL?.remove();
        if (this.linkPopover) {
            this.linkPopover.hide();
        }
        if (this._checkConnectionChange) {
            window.removeEventListener('online', this._checkConnectionChange);
            window.removeEventListener('offline', this._checkConnectionChange);
        }
        window.removeEventListener('beforeunload', this._onBeforeUnload);
        for (const timeout of this.tooltipTimeouts) {
            clearTimeout(timeout);
        }
    }
    /**
     * @override
     */
    _renderElement() {
        this.$editable = this.options.editable || $('<div class="note-editable">');

        // We add the field's name as id so default_focus will target it if
        // needed. For that to work, it has to already be editable but note that
        // the editor is at this point not yet instantiated.
        if (typeof this.options.fieldId !== 'undefined' && !this.options.inIframe) {
            this.$editable.attr('id', this.options.fieldId);
            this.$editable.attr('contenteditable', true);
        }

        this.$root = this.$editable;
        if (this.options.height) {
            this.$editable.height(this.options.height);
        }
        if (this.options.minHeight) {
            this.$editable.css('min-height', this.options.minHeight);
        }
        if (this.options.maxHeight && this.options.maxHeight > 10) {
            this.$editable.css('max-height', this.options.maxHeight);
        }
        if (this.options.resizable && !isMobileOS()) {
            const $wrapper = $('<div class="o_wysiwyg_wrapper odoo-editor">');
            this.$root = $wrapper;
            $wrapper.append(this.$editable);
            this.$resizer = $(`<div class="o_wysiwyg_resizer">
                <div class="o_wysiwyg_resizer_hook"></div>
                <div class="o_wysiwyg_resizer_hook"></div>
                <div class="o_wysiwyg_resizer_hook"></div>
            </div>`);
            $wrapper.append(this.$resizer);
            this._replaceElement($wrapper);

            const minHeight = this.options.minHeight || 100;
            this.$editable.height(this.options.height || minHeight);

            // resizer hooks
            let startOffsetTop;
            let startHeight;
            const $body = $(document.body);
            const resizerMousedown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                $body.on('mousemove', this.resizerMousemove);
                $body.on('mouseup', this.resizerMouseup);
                startHeight = this.$editable.height();
                startOffsetTop = e.pageY;
            };
            this.resizerMousemove = (e) => {
                const offsetTop = e.pageY - startOffsetTop;
                let height = startHeight + offsetTop;
                if (height < minHeight) {
                    height = minHeight;
                }
                this.$editable.height(height);
            };
            this.resizerMouseup = () => {
                $body.off('mousemove', this.resizerMousemove);
                $body.off('mouseup', this.resizerMouseup);
            };
            this.$resizer.on('mousedown', resizerMousedown);
        } else {
            if (!this.options.sideAttach) {
                this._replaceElement(this.$editable);
            }
        }
    }
    _replaceElement($el) {
        this.el.replaceWith($el[0]);
        this.$el = $el;
    }
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    /**
     * Return the editable area.
     *
     * @returns {jQuery}
     */
    getEditable() {
        return this.$editable;
    }
    /**
     * Return true if the content has changed.
     *
     * @returns {Boolean}
     */
    isDirty() {
        const isDocumentDirty = this.$editable[0].ownerDocument.defaultView.$(".o_dirty").length;
        return this._initialValue !== (this.getValue() || this.$editable.val()) && isDocumentDirty;
    }
    /**
     * Get the value of the editable element.
     *
     * @param {object} [options]
     * @param {jQuery} [options.$layout]
     * @returns {String}
     */
    getValue(options) {
        var $editable = options && options.$layout || this.$editable.clone();
        $editable.find('[contenteditable]').removeAttr('contenteditable');
        $editable.find('[class=""]').removeAttr('class');
        $editable.find('[style=""]').removeAttr('style');
        $editable.find('[title=""]').removeAttr('title');
        $editable.find('[alt=""]').removeAttr('alt');
        $editable.find('[data-bs-original-title=""]').removeAttr('data-bs-original-title');
        $editable.find('[data-editor-message]').removeAttr('data-editor-message');
        $editable.find('a.o_image, span.fa, i.fa').html('');
        $editable.find('[aria-describedby]').removeAttr('aria-describedby').removeAttr('data-bs-original-title');
        this.odooEditor && this.odooEditor.cleanForSave($editable[0]);
        this._attachHistoryIds($editable[0]);
        return $editable.html();
    }
    /**
     * Save the content in the target
     *      - in init option beforeSave
     *      - receive editable jQuery DOM as attribute
     *      - called after deactivate codeview if needed
     * @returns {Promise}
     *      - resolve with true if the content was dirty
     */
    save() {
        const isDirty = this.isDirty();
        const html = this.getValue();
        if (this.$editable.is('textarea')) {
            this.$editable.val(html);
        } else {
            this.$editable.html(html);
        }
        return Promise.resolve({isDirty: isDirty, html: html});
    }
    /**
     * Reset the history.
     */
    historyReset() {
        this.odooEditor.historyReset();
    }
    /**
     * Saves the content.
     *
     * @param {boolean} [reload=true]
     * @returns {Promise}
     */
    async saveContent(reload = true) {
        this.savingContent = true;
        await this.cleanForSave();

        const editables = "getContentEditableAreas" in this.options ? this.options.getContentEditableAreas(this.odooEditor) : [];
        await this.savePendingImages(editables.length ? $(editables) : this.$editable);
        await this._saveViewBlocks();
        this.savingContent = false;

        window.removeEventListener('beforeunload', this._onBeforeUnload);
        if (reload) {
            window.location.reload();
        }
    }
    /**
     * Checks if the Wysiwyg is currently saving content. It can be used to
     * prevent some unwanted actions during save.
     *
     * @returns {Boolean}
     */
    isSaving() {
        return !!this.savingContent;
    }
    /**
     * Asks the user if he really wants to discard its changes (if there are
     * some of them), then simply reload the page if he wants to.
     *
     * @param {boolean} [reload=true]
     *        true if the page has to be reloaded when the user answers yes
     *        (do nothing otherwise but add this to allow class extension)
     * @returns {Promise}
     */
    cancel(reload) {
        var self = this;
        return new Promise((resolve, reject) => {
            this.env.services.dialog.add(ConfirmationDialog, {
                body: _t("If you discard the current edits, all unsaved changes will be lost. You can cancel to return to edit mode."),
                confirm: () => resolve(),
                cancel: () => reject()
            });
        }).then(function () {
            if (reload !== false) {
                window.onbeforeunload = null;
                return self._reload();
            }
        });
    }
    /**
     * Create/Update attachments for unsaved images.
     * (e.g. modified/cropped images, drag & dropped images, pasted images..)
     *
     * @param {jQuery} $editable
     * @returns {Promise}
     */
    savePendingImages($editable = this.$editable) {
        const defs = Array.from($editable).map(async (editableEl) => {
            const {oeModel: resModel, oeId: resId} = editableEl.dataset;
            // When saving a webp, o_b64_image_to_save is turned into
            // o_modified_image_to_save by _saveB64Image to request the saving
            // of the pre-converted webp resizes and all the equivalent jpgs.
            const b64Proms = [...editableEl.querySelectorAll('.o_b64_image_to_save')].map(async el => {
                await this._saveB64Image(el, resModel, resId);
            });
            const modifiedProms = [...editableEl.querySelectorAll('.o_modified_image_to_save')].map(async el => {
                await this._saveModifiedImage(el, resModel, resId);
            });
            return Promise.all([...b64Proms, ...modifiedProms]);
        });
        return Promise.all(defs);
    }
    /**
     * @param {String} value
     * @returns {String}
     */
    setValue(value) {
        this.odooEditor.resetContent(value);
    }
    /**
     * Undo one step of change in the editor.
     */
    undo() {
        this.odooEditor.historyUndo();
    }
    /**
     * Redo one step of change in the editor.
     */
    redo() {
        this.odooEditor.historyRedo();
    }
    /**
     * Focus inside the editor.
     *
     * Set cursor to the editor latest position before blur or to the last editable node, ready to type.
     */
    focus() {
        if (this.odooEditor && !this.odooEditor.historyResetLatestComputedSelection(true)) {
            // If the editor don't have an history step to focus to,
            // We place the cursor after the end of the editor exiting content.
            const range = document.createRange();
            const elementToTarget = this.$editable[0].lastElementChild ? this.$editable[0].lastElementChild : this.$editable[0];
            range.selectNodeContents(elementToTarget);
            range.collapse();

            const selection = this.odooEditor.document.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    getDeepRange() {
        return getDeepRange(this.odooEditor.editable);
    }
    closestElement(...args) {
        return closestElement(...args);
    }
    async cleanForSave() {
        if (this.odooEditor) {
            this.odooEditor.cleanForSave();
            this._attachHistoryIds();
        }

        if (this.snippetsMenu) {
            await this.snippetsMenu.cleanForSave();
        }
    }
    isSelectionInEditable() {
        return this.odooEditor.isSelectionInEditable();
    }
    /**
     * Start or resume the Odoo field changes muation observers.
     *
     * Necessary to keep all copies of a given field at the same value throughout the page.
     */
    _observeOdooFieldChanges() {
        const observerOptions = {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeOldValue: true,
        };
        if (this.odooFieldObservers) {
            for (let observerData of this.odooFieldObservers) {
                observerData.observer.observe(observerData.field, observerOptions);
            }
        } else {
            const odooFieldSelector = '[data-oe-model], [data-oe-translation-initial-sha]';
            const $odooFields = this.$editable.find(odooFieldSelector);
            this.odooFieldObservers = [];

            $odooFields.each((i, field) => {
                const observer = new MutationObserver((mutations) => {
                    mutations = this.odooEditor.filterMutationRecords(mutations);
                    if (!mutations.length) {
                        return;
                    }
                    let $node = $(field);
                    // Do not forward "unstyled" copies to other nodes.
                    if ($node.hasClass('o_translation_without_style')) {
                        return;
                    }
                    let $nodes = $odooFields.filter(function () {
                        return this !== field;
                    });
                    if ($node.data('oe-model')) {
                        $nodes = $nodes.filter('[data-oe-model="' + $node.data('oe-model') + '"]')
                            .filter('[data-oe-id="' + $node.data('oe-id') + '"]')
                            .filter('[data-oe-field="' + $node.data('oe-field') + '"]');
                    }

                    if ($node.data('oe-translation-initial-sha')) {
                        $nodes = $nodes.filter('[data-oe-translation-initial-sha="' + $node.data('oe-translation-initial-sha') + '"]');
                    }
                    if ($node.data('oe-type')) {
                        $nodes = $nodes.filter('[data-oe-type="' + $node.data('oe-type') + '"]');
                    }
                    if ($node.data('oe-expression')) {
                        $nodes = $nodes.filter('[data-oe-expression="' + $node.data('oe-expression') + '"]');
                    } else if ($node.data('oe-xpath')) {
                        $nodes = $nodes.filter('[data-oe-xpath="' + $node.data('oe-xpath') + '"]');
                    }
                    if ($node.data('oe-contact-options')) {
                        $nodes = $nodes.filter("[data-oe-contact-options='" + $node[0].dataset.oeContactOptions + "']");
                    }

                    let nodes = $node.get();

                    if ($node.data('oe-type') === "many2one") {
                        $nodes = $nodes.add($('[data-oe-model]')
                            .filter(function () {
                                return this !== $node[0] && nodes.indexOf(this) === -1;
                            })
                            .filter('[data-oe-many2one-model="' + $node.data('oe-many2one-model') + '"]')
                            .filter('[data-oe-many2one-id="' + $node.data('oe-many2one-id') + '"]')
                            .filter('[data-oe-type="many2one"]'));

                        $nodes = $nodes.add($('[data-oe-model]')
                            .filter(function () {
                                return this !== $node[0] && nodes.indexOf(this) === -1;
                            })
                            .filter('[data-oe-model="' + $node.data('oe-many2one-model') + '"]')
                            .filter('[data-oe-id="' + $node.data('oe-many2one-id') + '"]')
                            .filter('[data-oe-field="name"]'));
                    }

                    this._pauseOdooFieldObservers();
                    // Tag the date fields to only replace the value
                    // with the original date value once (see mouseDown event)
                    if ($node.hasClass('o_editable_date_field_format_changed')) {
                        $nodes.addClass('o_editable_date_field_format_changed');
                    }
                    const html = $node.html();
                    for (const node of $nodes) {
                        if (node.classList.contains('o_translation_without_style')) {
                            // For generated elements such as the navigation
                            // labels of website's table of content, only the
                            // text of the referenced translation must be used.
                            const text = $node.text();
                            if (node.innerText !== text) {
                                node.innerText = text;
                            }
                            continue;
                        }
                        if (node.innerHTML !== html) {
                            node.innerHTML = html;
                        }
                    }
                    this._observeOdooFieldChanges();
                });
                observer.observe(field, observerOptions);
                this.odooFieldObservers.push({field: field, observer: observer});
            });
        }
    }
    /**
     * Stop the field changes mutation observers.
     */
    _pauseOdooFieldObservers() {
        for (let observerData of this.odooFieldObservers) {
            observerData.observer.disconnect();
        }
    }
    /**
     * Open the link tools or the image link tool depending on the selection.
     */
    openLinkToolsFromSelection() {
        const targetEl = this.odooEditor.document.getSelection().getRangeAt(0).startContainer;
        // Link tool is different if the selection is an image or a text.
        if (targetEl.nodeType === Node.ELEMENT_NODE
                && (targetEl.tagName === 'IMG' || targetEl.querySelectorAll('img').length === 1)) {
            this.odooEditor.dispatchEvent(new Event('activate_image_link_tool'));
            return;
        }
        this.toggleLinkTools();
    }
    /**
     * Toggle the Link tools/dialog to edit links. If a snippet menu is present,
     * use the link tools, otherwise use the dialog.
     *
     * @param {boolean} [options.forceOpen] default: false
     * @param {boolean} [options.forceDialog] force to open the dialog
     * @param {boolean} [options.link] The anchor element to edit if it is known.
     * @param {boolean} [options.shoudFocusUrl=true] Disable the automatic focusing of the URL field.
     */
    async toggleLinkTools(options = {}) {
        const shouldFocusUrl = options.shouldFocusUrl === undefined ? true : options.shouldFocusUrl;

        const linkEl = getInSelection(this.odooEditor.document, 'a');
        if (linkEl && (!linkEl.matches(this.customizableLinksSelector) || !linkEl.isContentEditable)) {
            return;
        }
        if (this.snippetsMenu && !options.forceDialog) {
            if (options.link && options.link.querySelector(mediaSelector) &&
                    !options.link.textContent.trim() && wysiwygUtils.isImg(this.lastElement)) {
                // If the link contains a media without text, the link is
                // editable in the media options instead.
                this.snippetsMenu._mutex.exec(() => {
                    // Wait for the editor panel to be fully updated.
                    this.odooEditor.dispatchEvent(new Event('activate_image_link_tool'));
                });
                return;
            }
            if (options.forceOpen || !this.state.linkToolProps) {
                const $button = this.toolbar$El.find('#create-link');
                if (!this.state.linkToolProps || ![options.link, ...wysiwygUtils.ancestors(options.link)].includes(this.linkToolsInfos.link)) {
                    const { link } = getOrCreateLink({
                        containerNode: this.odooEditor.editable,
                        startNode: options.link || this.lastMediaClicked,
                    });
                    if (!link) {
                        return;
                    }
                    const addHintClasses = () => {
                        this.odooEditor.observerUnactive("hint_classes");
                        link.classList.add('oe_edited_link');
                        $button.addClass('active');
                        this.odooEditor.observerActive("hint_classes");
                    };
                    const removeHintClasses = () => {
                        this.odooEditor.observerUnactive("hint_classes");
                        link.classList.remove('oe_edited_link');
                        $button.removeClass('active');
                        this.odooEditor.observerActive("hint_classes");
                    };
                    this.linkToolsInfos = {
                        onDestroy: () => {},
                        link,
                        removeHintClasses,
                    };

                    addHintClasses();
                    this.state.linkToolProps = {
                        wysiwyg: this,
                        editable: this.odooEditor.editable,
                        link,
                        forceNewWindow: this.options.linkForceNewWindow,
                        initialIsNewWindow: this.options.linkInitialIsNewWindow,
                        // If the link contains an image or an icon do not
                        // display the label input (e.g. some mega menu links).
                        needLabel: !link.querySelector('.fa, img'),
                        shouldFocusUrl,
                        $button,
                        onColorCombinationClassChange: (colorCombinationClass) => {
                            this.linkToolsInfos.colorCombinationClass = colorCombinationClass;
                        },
                        onPreApplyLink: removeHintClasses,
                        onPostApplyLink: addHintClasses,
                        onDestroy: () => {
                            removeHintClasses();
                            this.linkToolsInfos.onDestroy();
                        }
                    };
                }
                const _onClick = ev => {
                    if (
                        !ev.target.closest('#create-link') &&
                        (!ev.target.closest('.oe-toolbar') || !ev.target.closest('we-customizeblock-option')) &&
                        !ev.target.closest('.ui-autocomplete') &&
                        (!this.state.linkToolProps || ![ev.target, ...wysiwygUtils.ancestors(ev.target)].includes(this.linkToolsInfos.link))
                    ) {
                        // Destroy the link tools on click anywhere outside the
                        // toolbar if the target is the orgiginal target not in the original target.
                        this.destroyLinkTools();
                        this.odooEditor.document.removeEventListener('click', _onClick, true);
                        document.removeEventListener('click', _onClick, true);
                    }
                };
                this.odooEditor.document.addEventListener('click', _onClick, true);
                document.addEventListener('click', _onClick, true);
            } else {
                this.destroyLinkTools();
            }
        } else {
            const historyStepIndex = this.odooEditor.historySize() - 1;
            this.odooEditor.historyPauseSteps();
            let { link } = getOrCreateLink({
                containerNode: this.odooEditor.editable,
                startNode: options.link,
            });
            if (!link) {
                return
            }
            this.env.services.dialog.add(LinkDialog, {
                editable: this.odooEditor.editable,
                link,
                forceNewWindow: this.options.linkForceNewWindow,
                initialIsNewWindow: this.options.linkInitialIsNewWindow,
                needLabel: true,
                focusField: link.innerHTML ? 'url' : '',
                onSave: (data) => {
                    if (!data) {
                        return;
                    }
                    getDeepRange(this.$editable[0], {range: data.range, select: true});
                    if (this.options.userGeneratedContent) {
                        data.rel = 'ugc';
                    }
                    data.linkDialog.applyLinkToDom(data);
                    this.odooEditor.historyStep();
                    const link = data.linkDialog.$link[0];
                    this.odooEditor.setContenteditableLink(link);
                    setSelection(link, 0, link, link.childNodes.length, false);
                    link.focus();
                },
                close: () => {
                    this.odooEditor.historyUnpauseSteps();
                    this.odooEditor.historyRevertUntil(historyStepIndex)
                }
            });
        }
    }
    /**
     * Removes the current Link.
     */
    removeLink() {
        if (this.snippetsMenu && wysiwygUtils.isImg(this.lastElement)) {
            this.snippetsMenu._mutex.exec(() => {
                // Wait for the editor panel to be fully updated.
            this.odooEditor.dispatchEvent(new Event('deactivate_image_link_tool'));
            });
        } else {
            this.odooEditor.execCommand('unlink');
        }
    }
    /**
     * Destroy the Link tools/dialog and restore the selection.
     */
    // todo: review me
    async destroyLinkTools() {
        if (this.state.linkToolProps) {
            const selection = this.odooEditor.document.getSelection();
            const link = this.linkToolsInfos.link;
            let anchorNode
            let focusNode;
            let anchorOffset = 0;
            let focusOffset;
            if (selection && link.parentElement) {
                // Focus the link after the dialog element is removed.
                if (shouldUnlink(this.linkToolsInfos.link, this.linkToolsInfos.colorCombinationClass)) {
                    if (link.childNodes.length) {
                        anchorNode = link.childNodes[0];
                        focusNode = link.childNodes[link.childNodes.length - 1];
                    } else {
                        const parent = link.parentElement;
                        const index = Array.from(parent.childNodes).indexOf(link);
                        anchorNode = focusNode = parent;
                        anchorOffset = focusOffset = index;
                    }
                } else {
                    anchorNode = link;
                    focusNode = link;
                }
                if (!focusOffset) {
                    focusOffset = focusNode.childNodes.length || focusNode.length;
                }
            }
            this.linkToolsInfos.removeHintClasses();
            if (anchorNode) {
                this.linkToolsInfos.onDestroy = () => {
                    setSelection(anchorNode, anchorOffset, focusNode, focusOffset, false);
                }
            }
            this.state.linkToolProps = undefined;
        }
    }
    /**
     * Take an image's URL and display it in a fullscreen viewer.
     *
     * @todo should use `useFileViewer` instead once Wysiwyg becomes an Owl Component.
     * @param {string} url
     */
    showImageFullscreen(url) {
        const viewerId = `web.file_viewer${fileViewerId++}`;
        registry.category("main_components").add(viewerId, {
            Component: FileViewer,
            props: {
                files: [{
                        isImage: true,
                        isViewable: true,
                        displayName: url,
                        defaultSource: url,
                        downloadUrl: url,
                }],
                startIndex: 0,
                close: () => {
                    registry.category('main_components').remove(viewerId);
                },
            },
        });
        this.odooEditor.document.getSelection()?.removeAllRanges();
        this.odooEditor.editable.blur();
    }
    /**
     * Open the media dialog.
     *
     * Used to insert or change image, icon, document and video.
     *
     * @param {object} params
     * @param {Node} [params.node] Optionnal
     * @param {Node} [params.htmlClass] Optionnal
     */
    openMediaDialog(params = {}) {
        const sel = this.odooEditor.document.getSelection();

        if (!sel.rangeCount) {
            return;
        }
        const range = sel.getRangeAt(0);
        // We lose the current selection inside the content editable when we
        // click the media dialog button so we need to be able to restore the
        // selection when the modal is closed.
        const restoreSelection = preserveCursor(this.odooEditor.document);

        const $editable = $(OdooEditorLib.closestElement(range.startContainer, '.o_editable') || this.odooEditor.editable);
        const model = $editable.data('oe-model');
        const field = $editable.data('oe-field');
        const type = $editable.data('oe-type');

        this.env.services.dialog.add(MediaDialog, {
            resModel: model,
            resId: $editable.data('oe-id'),
            domain: $editable.data('oe-media-domain'),
            useMediaLibrary: !!(field && (model === 'ir.ui.view' && field === 'arch' || type === 'html')),
            media: params.node,
            save: this._onMediaDialogSave.bind(this, {
                node: params.node,
                restoreSelection: restoreSelection,
            }),
            onAttachmentChange: this._onAttachmentChange.bind(this),
            close: () => restoreSelection(),
            ...this.options.mediaModalParams,
            ...params,
        });
    }
    // todo: test me
    showEmojiPicker() {
        const targetEl = this.odooEditor.document.getSelection();
        const closest = closestBlock(targetEl.anchorNode);
        const restoreSelection = preserveCursor(this.odooEditor.document);
        const blockWidth = parseInt(getComputedStyle(closest).width.slice(0, -2)); // remove 'px'
        // Calculate one/fouth portion of blockWidth, and then on the basis of our cursor position
        // check in which quadrant it falls, give the popover its position accordingly
        const portionWidth = (blockWidth / 4);
        const cursorAt = getRangePosition(targetEl, this.odooEditor.document).left;
        let position = 'end';
        if (cursorAt < portionWidth * 2) {
            position = 'start';
        } else if (cursorAt <= portionWidth * 3) {
            position = 'middle';
        }
        const emojiPicker = new ComponentWrapper(this, EmojiPickerWrapper, {
            targetEl: closest,
            position,
            onSelect: (str) => {
                restoreSelection();
                this.odooEditor.execCommand('insert', str);
            }
        });
        emojiPicker.mount(closest);
    }
    /**
     * Sets custom CSS Variables on the snippet menu element.
     * Used for color previews and color palette to get the color
     * values of the editable. (e.g. if the editable is in an iframe
     * with different SCSS color values as the top window.)
     *
     * @param {HTMLElement} element
     */
    setCSSVariables(element) {
        const stylesToCopy = weUtils.EDITOR_COLOR_CSS_VARIABLES;

        for (const style of stylesToCopy) {
            element.style.setProperty(`--we-cp-${style}`, weUtils.getCSSVariableValue(style));
        }

        element.classList.toggle('o_we_has_btn_outline_primary',
            weUtils.getCSSVariableValue('btn-primary-outline') === 'true');
        element.classList.toggle('o_we_has_btn_outline_secondary',
            weUtils.getCSSVariableValue('btn-secondary-outline') === 'true');
    }
    /**
     * Detached function to allow overriding.
     *
     * @param {Object} params binded @see openMediaDialog
     * @param {Element} element provided by the dialog
     */
    _onMediaDialogSave(params, element) {
        params.restoreSelection();
        if (!element) {
            return;
        }

        if (params.node) {
            const isIcon = (el) => el.matches('i.fa, span.fa');
            const changedIcon = isIcon(params.node) && isIcon(element);
            if (changedIcon) {
                // Preserve tag name when changing an icon and not recreate the
                // editors unnecessarily.
                for (const attribute of element.attributes) {
                    params.node.setAttribute(attribute.nodeName, attribute.nodeValue);
                }
            } else {
                params.node.replaceWith(element);
            }
            this.odooEditor.unbreakableStepUnactive();
            this.odooEditor.historyStep();
        } else {
            return this.odooEditor.execCommand('insert', element);
        }

        if (this.snippetsMenu) {
            this.snippetsMenu.activateSnippet($(element)).then(() => {
                if (element.tagName === 'IMG') {
                    $(element).trigger('image_changed');
                }
            });
        }
    }
    getInSelection(selector) {
        return getInSelection(this.odooEditor.document, selector);
    }
    /**
     * Adds an empty action in the mutex. Can be used to wait for some options
     * to be initialized before doing something else.
     *
     * @returns {Promise}
     */
    waitForEmptyMutexAction() {
        if (this.snippetsMenu) {
            return this.snippetsMenu.execWithLoadingEffect(() => null, false);
        }
        return Promise.resolve();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Returns an instance of the snippets menu.
     *
     * @param {Object} [options]
     * @returns {widget}
     */
    async _createSnippetsMenuInstance(options={}) {
        const snippetsEditor = await requireWysiwygLegacyModule('@web_editor/js/editor/snippets.editor');
        const { SnippetsMenu } = snippetsEditor[Symbol.for("default")];
        return new SnippetsMenu(this, Object.assign({
            wysiwyg: this,
            selectorEditableArea: '.o_editable',
        }, options));
    }
    _configureToolbar(options) {
        const $toolbar = this.toolbar$El;
        // Prevent selection loss when interacting with the toolbar buttons.
        $toolbar.find('.btn-group').on('mousedown', e => {
            if (
                // Prevent when clicking on btn-group but not on dropdown items.
                !e.target.closest('.dropdown-menu') ||
                // Unless they have a data-call in which case there is an editor
                // command that is bound to it so we need to preventDefault.
                e.target.closest('.btn') && e.target.closest('.btn').getAttribute('data-call')
            ) {
                e.preventDefault();
            }
        });
        const openTools = e => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            switch (e.target.id) {
                case 'create-link':
                    this.toggleLinkTools();
                    break;
                case 'media-insert':
                case 'media-replace':
                    this.openMediaDialog({ node: this.lastMediaClicked });
                    break;
                case 'media-description': {
                    const allEscQuots = /&quot;/g;
                    const alt = ($(this.lastMediaClicked).attr('alt') || "").replace(allEscQuots, '"');
                    const tag_title = (
                        $(this.lastMediaClicked).attr('title') ||
                        $(this.lastMediaClicked).data('original-title') ||
                        ""
                    ).replace(allEscQuots, '"');

                    this.env.services.dialog.add(AltDialog, {
                        alt,
                        tag_title,
                        confirm: (newAlt, newTitle) => {
                            if (newAlt) {
                                this.lastMediaClicked.setAttribute('alt', newAlt);
                            } else {
                                this.lastMediaClicked.removeAttribute('alt');
                            }
                            if (newTitle) {
                                this.lastMediaClicked.setAttribute('title', newTitle);
                            } else {
                                this.lastMediaClicked.removeAttribute('title');
                            }
                        },
                    });
                    break;
                }
            }
        };
        if (!options.snippets) {
            $toolbar.find('#justify, #media-insert').remove();
        }
        $toolbar.find('#image-fullscreen').click(() => {
            if (!this.lastMediaClicked?.src) {
                return;
            }
            this.showImageFullscreen(this.lastMediaClicked.src);
    })
        $toolbar.find('#media-insert, #media-replace, #media-description').click(openTools);
        $toolbar.find('#create-link').click(openTools);
        $toolbar.find('#image-shape div, #fa-spin').click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            this.lastMediaClicked.classList.toggle(e.target.id);
            e.target.classList.toggle('active', $(this.lastMediaClicked).hasClass(e.target.id));
        });
        const $imageWidthButtons = $toolbar.find('#image-width div');
        $imageWidthButtons.click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            this.lastMediaClicked.style.width = e.target.id;
            for (const button of $imageWidthButtons) {
                button.classList.toggle('active', this.lastMediaClicked.style.width === button.id);
            }
        });
        $toolbar.find('#image-padding .dropdown-item').click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            $(this.lastMediaClicked).removeClass((index, className) => (
                (className.match(/(^|\s)padding-\w+/g) || []).join(' ')
            )).addClass(e.target.dataset.class);
        });
        $toolbar.on('mousedown', e => {
            const justifyBtn = e.target.closest('#justify div.btn');
            if (!justifyBtn || !this.lastMediaClicked) {
                return;
            }
            e.originalEvent.stopImmediatePropagation();
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
            const mode = justifyBtn.id.replace('justify', '').toLowerCase();
            const classes = mode === 'center' ? ['d-block', 'mx-auto'] : ['float-' + mode];
            const doAdd = classes.some(className => !this.lastMediaClicked.classList.contains(className));
            this.lastMediaClicked.classList.remove('float-start', 'float-end');
            if (this.lastMediaClicked.classList.contains('mx-auto')) {
                this.lastMediaClicked.classList.remove('d-block', 'mx-auto');
            }
            if (doAdd) {
                this.lastMediaClicked.classList.add(...classes);
            }
            this._updateMediaJustifyButton(justifyBtn.id);
        });
        $toolbar.find('#image-crop').click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            this.imageCropProps.media = this.lastMediaClicked;
            this.imageCropProps.showCount++;
            this.odooEditor.toolbarHide();
            $(this.lastMediaClicked).on('image_cropper_destroyed', () => this.odooEditor.toolbarShow());
        });
        $toolbar.find('#image-transform').click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            const $image = $(this.lastMediaClicked);
            if ($image.data('transfo-destroy')) {
                $image.removeData('transfo-destroy');
                return;
            }
            $image.transfo({document: this.odooEditor.document});
            const mouseup = () => {
                $('#image-transform').toggleClass('active', $image.is('[style*="transform"]'));
            };
            $(this.odooEditor.document).on('mouseup', mouseup);
            const mousedown = mousedownEvent => {
                if (!$(mousedownEvent.target).closest('.transfo-container').length) {
                    $image.transfo('destroy');
                    $(this.odooEditor.document).off('mousedown', mousedown).off('mouseup', mouseup);
                }
                if ($(mousedownEvent.target).closest('#image-transform').length) {
                    $image.data('transfo-destroy', true).attr('style', ($image.attr('style') || '').replace(/[^;]*transform[\w:]*;?/g, ''));
                }
                $image.trigger('content_changed');
            };
            $(this.odooEditor.document).on('mousedown', mousedown);
        });
        $toolbar.find('#image-delete').click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            $(this.lastMediaClicked).remove();
            this.lastMediaClicked = undefined;
            this.odooEditor.toolbarHide();
        });
        $toolbar.find('#fa-resize div').click(e => {
            if (!this.lastMediaClicked) {
                return;
            }
            const $target = $(this.lastMediaClicked);
            const sValue = e.target.dataset.value;
            $target.attr('class', $target.attr('class').replace(/\s*fa-[0-9]+x/g, ''));
            if (+sValue > 1) {
                $target.addClass('fa-' + sValue + 'x');
            }
            this._updateFaResizeButtons();
        });
        // we need the Timeout to be sure the editable content is loaded
        // before calculating the scrollParent() element.
        setTimeout(() => {
            const scrollableContainer = this.$el.scrollParent();
            if (!options.snippets && scrollableContainer.length) {
                this.odooEditor.addDomListener(
                    scrollableContainer[0],
                    'scroll',
                    this.odooEditor.updateToolbarPosition.bind(this.odooEditor),
                );
            }
        }, 0);
    }
    /**
     * @private
     * @param {jQuery} $
     * @param {String} colorType 'text' or 'background'
     * @returns {String} color
     */
    _getSelectedColor($, colorType) {
        const selection = this.odooEditor.document.getSelection();
        if (!selection) return;
        const range = selection.rangeCount && selection.getRangeAt(0);
        const targetNode = range && range.startContainer;
        const targetElement = targetNode && targetNode.nodeType === Node.ELEMENT_NODE
            ? targetNode
            : targetNode && targetNode.parentNode;
        const backgroundImage = $(targetElement).css('background-image');
        let backgroundGradient = false;
        if (weUtils.isColorGradient(backgroundImage)) {
            const textGradient = targetElement.classList.contains('text-gradient');
            if (colorType === "text" && textGradient || colorType !== "text" && !textGradient) {
                backgroundGradient = backgroundImage;
            }
        }
        return backgroundGradient || $(targetElement).css(colorType === "text" ? 'color' : 'backgroundColor');
    }
    onColorpaletteDropdownHide(ev) {
        return !(ev.clickEvent && ev.clickEvent.__isColorpickerClick);
    }
    onColorpaletteDropdownShow(colorType) {
        const selectedColor = this._getSelectedColor($, colorType);
        this.colorPalettesProps[colorType].resetTabCount++;
        this.colorPalettesProps[colorType].selectedColor = selectedColor;

        const selection = this.odooEditor.document.getSelection();
        const range = selection.rangeCount && selection.getRangeAt(0);
        this.hadNonCollapsedSelectionBeforeColorpicker = range && !selection.isCollapsed;

        // The color_leave event will revert the mutations with
        // `historyRevertCurrentStep`. We must stash the current
        // mutations to prevent them from being reverted.
        this.odooEditor.historyStash();
    }
    _processAndApplyColor(colorType, color, previewMode) {
        if (!color) {
            color = 'inherit';
        } else if (!isCSSColor(color) && !weUtils.isColorGradient(color)) {
            color = (colorType === "text" ? 'text-' : 'bg-') + color;
        }
        const coloredElements = this.odooEditor.execCommand('applyColor', color, colorType === 'text' ? 'color' : 'backgroundColor', this.lastMediaClicked);

        const coloredTds = coloredElements && coloredElements.length && Array.isArray(coloredElements) && coloredElements.filter(coloredElement => coloredElement.classList.contains('o_selected_td'));
        if (coloredTds.length) {
            const propName = colorType === 'text' ? 'color' : 'background-color';
            for (const td of coloredTds) {
                // Make it important so it has priority over selection color.
                td.style.setProperty(propName, td.style[propName], previewMode ? 'important' : '');
            }
        } else if (!this.lastMediaClicked && coloredElements && coloredElements.length && Array.isArray(coloredElements)) {
            // Ensure the selection in the fonts tags, otherwise an undetermined
            // race condition could generate a wrong selection later.
            const first = coloredElements[0];
            const last = coloredElements[coloredElements.length - 1];

            const sel = this.odooEditor.document.getSelection();
            sel.removeAllRanges();
            const range = new Range();
            range.setStart(first, 0);
            range.setEnd(...endPos(last));
            sel.addRange(range);
        }

        const hexColor = this._colorToHex(color);
        this.odooEditor.updateColorpickerLabels({
            [colorType === 'text' ? 'text' : 'hiliteColor']: hexColor,
        });
    }
    _colorToHex(color) {
        if (color.startsWith('#')) {
            return color;
        } else if (weUtils.isColorGradient(color)) {
            // return gradient the way it is: updateColorpickerLabels will handle it
            return color;
        } else {
            let rgbColor;
            if (color.startsWith('rgb')) {
                rgbColor = color;
            } else {
                const $font = $(`<font class="${color}"/>`);
                $(document.body).append($font);
                const propertyName = color.startsWith('text') ? 'color' : 'backgroundColor';
                rgbColor = $font.css(propertyName);
                $font.remove();
            }
            return rgbToHex(rgbColor);
        }
    }
    /**
     * Handle custom keyboard shortcuts.
     */
    _handleShortcuts(e) {
        // Open the link tool when CTRL+K is pressed.
        if (this.options.bindLinkTool && e && e.key === 'k' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.openLinkToolsFromSelection();
        }
        // Override selectAll (CTRL+A) to restrict it to the editable zone / current snippet and prevent traceback.
        if (e && e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const selection = this.odooEditor.document.getSelection();
            const containerSelector = '#wrap>*, .oe_structure>*, [contenteditable]';
            const container =
                (selection &&
                    closestElement(selection.anchorNode, containerSelector)) ||
                // In case a suitable container could not be found then the
                // selection is restricted inside the editable area.
                this.$editable.find(containerSelector);
            if (container) {
                const range = document.createRange();
                range.selectNodeContents(container);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }
    /**
     * Update any editor UI that is not handled by the editor itself.
     */
    _updateEditorUI(e) {
        let selection = this.odooEditor.document.getSelection();
        if (!selection) return;
        const anchorNode = selection.anchorNode;
        if (isProtected(anchorNode)) {
            return;
        }

        this.odooEditor.automaticStepSkipStack();
        // We need to use the editor's window so the tooltip displays in its
        // document even if it's in an iframe.
        const editorWindow = this.odooEditor.document.defaultView;
        const $target = e ? editorWindow.$(e.target) : editorWindow.$();
        // Restore paragraph dropdown button's default ID.
        this.toolbar$El.find('#mediaParagraphDropdownButton').attr('id', 'paragraphDropdownButton');
        // Only show the media tools in the toolbar if the current selected
        // snippet is a media.
        const isInMedia = $target.is(mediaSelector) && !$target.parent().hasClass('o_stars') && e.target &&
            (e.target.isContentEditable || (e.target.parentElement && e.target.parentElement.isContentEditable));
        this.toolbar$El.find([
            '#image-preview',
            '#image-shape',
            '#image-width',
            '#image-padding',
            '#image-edit',
            '#media-replace',
        ].join(',')).toggleClass('d-none', !isInMedia);
        // The image replace button is in the image options when the sidebar
        // exists.
        if (this.snippetsMenu && !this.snippetsMenu.folded && $target.is('img')) {
            this.toolbar$El.find('#media-replace').toggleClass('d-none', true);
        }
        // Only show the image-transform, image-crop and media-description
        // buttons if the current selected snippet is an image.
        this.toolbar$El.find([
            '#image-transform',
            '#image-crop',
            '#media-description',
        ].join(',')).toggleClass('d-none', !$target.is('img'));
        this.lastMediaClicked = isInMedia && e.target;
        this.lastElement = $target[0];
        // Hide the irrelevant text buttons for media.
        this.toolbar$El.find([
            '#style',
            '#decoration',
            '#font-size',
            '#justifyFull',
            '#list',
            '#colorInputButtonGroup',
            '#create-link',
            '#media-insert', // "Insert media" should be replaced with "Replace media".
        ].join(',')).toggleClass('d-none', isInMedia);
        // Some icons are relevant for icons, that aren't for other media.
        this.toolbar$El.find('#colorInputButtonGroup, #create-link').toggleClass('d-none', isInMedia && !$target.is('.fa'));
        this.toolbar$El.find('.only_fa').toggleClass('d-none', !$target.is('.fa'));
        // Hide unsuitable buttons for icon
        if ($target.is('.fa')) {
            this.toolbar$El.find([
                '#image-shape',
                '#image-width',
                '#image-edit',
            ].join(',')).toggleClass('d-none', true);
        }
        // Hide the create-link button if the selection spans several blocks.
        selection = this.odooEditor.document.getSelection();
        const range = selection && selection.rangeCount && selection.getRangeAt(0);
        const $rangeContainer = range && $(range.commonAncestorContainer);
        const spansBlocks = range && !!$rangeContainer.contents().filter((i, node) => isBlock(node)).length;
        if (!range || spansBlocks) {
            this.toolbar$El.find('#create-link').toggleClass('d-none', true);
        }
        // Toggle the toolbar arrow.
        this.toolbar$El.toggleClass('noarrow', isInMedia);
        // Unselect all media.
        this.$editable.find('.o_we_selected_image').removeClass('o_we_selected_image');
        if (isInMedia) {
            this.odooEditor.automaticStepSkipStack();
            // Select the media in the DOM.
            const selection = this.odooEditor.document.getSelection();
            const range = this.odooEditor.document.createRange();
            range.selectNode(this.lastMediaClicked);
            selection.removeAllRanges();
            selection.addRange(range);
            // Always hide the unlink button on media.
            this.toolbar$El.find('#unlink').toggleClass('d-none', true);
            // Toggle the 'active' class on the active image tool buttons.
            for (const button of this.toolbar$El.find('#image-shape div, #fa-spin')) {
                button.classList.toggle('active', $(e.target).hasClass(button.id));
            }
            for (const button of this.toolbar$El.find('#image-width div')) {
                button.classList.toggle('active', e.target.style.width === button.id);
            }
            this._updateMediaJustifyButton();
            this._updateFaResizeButtons();
        }
        if (isInMedia) {
            // Handle the media/link's tooltip.
            this.showTooltip = true;
            this.tooltipTimeouts.push(setTimeout(() => {
                // Do not show tooltip on double-click and if there is already one
                if (!this.showTooltip || $target.attr('title') !== undefined) {
                    return;
                }
                this.odooEditor.observerUnactive();
                // Tooltips need to be cleared before leaving the editor.
                this.saving_mutex.exec(() => {
                    $target.tooltip({title: _t('Double-click to edit'), trigger: 'manual', container: 'body'}).tooltip('show');
                    this.tooltipTimeouts.push(setTimeout(() => $target.tooltip('dispose'), 800));
                });
                this.odooEditor.observerActive();
            }, 400));
        }
        // Update color of already opened colorpickers.
        setTimeout(() => {
            for (const colorType in this.colorPalettesProps) {
                const selectedColor = this._getSelectedColor($, colorType);
                if (selectedColor) {
                    // If the palette was already opened (e.g. modifying a gradient), the new DOM state
                    // must be reflected in the palette, but the tab selection must not be impacted.
                    this.colorPalettesProps[colorType].selectedColor = selectedColor;
                }
            }
        });
    }
    _updateMediaJustifyButton(commandState) {
        if (!this.lastMediaClicked) {
            return;
        }
        const $paragraphDropdownButton = this.toolbar$El.find('#paragraphDropdownButton, #mediaParagraphDropdownButton');
        // Change the ID to prevent OdooEditor from controlling it as this is
        // custom behavior for media.
        $paragraphDropdownButton.attr('id', 'mediaParagraphDropdownButton');
        let resetAlignment = true;
        if (!commandState) {
            const justifyMapping = [
                ['float-start', 'justifyLeft'],
                ['mx-auto', 'justifyCenter'],
                ['float-end', 'justifyRight'],
            ];
            commandState = (justifyMapping.find(pair => (
                this.lastMediaClicked.classList.contains(pair[0]))
            ) || [])[1];
            resetAlignment = !commandState;
        }
        const $buttons = this.toolbar$El.find('#justify div.btn');
        let newClass;
        if (commandState) {
            const direction = commandState.replace('justify', '').toLowerCase();
            newClass = `fa-align-${direction === 'full' ? 'justify' : direction}`;
            resetAlignment = !['float-start', 'mx-auto', 'float-end'].some(className => (
                this.lastMediaClicked.classList.contains(className)
            ));
        }
        for (const button of $buttons) {
            button.classList.toggle('active', !resetAlignment && button.id === commandState);
        }
        $paragraphDropdownButton.removeClass((index, className) => (
            (className.match(/(^|\s)fa-align-\w+/g) || []).join(' ')
        ));
        if (commandState && !resetAlignment) {
            $paragraphDropdownButton.addClass(newClass);
        } else {
            // Ensure we always display an icon in the align toolbar button.
            $paragraphDropdownButton.addClass('fa-align-justify');
        }
    }
    _updateFaResizeButtons() {
        if (!this.lastMediaClicked) {
            return;
        }
        const $buttons = this.toolbar$El.find('#fa-resize div');
        const match = this.lastMediaClicked.className.match(/\s*fa-([0-9]+)x/);
        const value = match && match[1] ? match[1] : '1';
        for (const button of $buttons) {
            button.classList.toggle('active', button.dataset.value === value);
        }
    }
    _getEditorOptions(options) {
        const finalOptions = {...this.defaultOptions, ...options};
        // autohideToolbar is true by default (false by default if navbar present).
        finalOptions.autohideToolbar = typeof finalOptions.autohideToolbar === 'boolean'
            ? finalOptions.autohideToolbar
            : !finalOptions.snippets;

        return finalOptions;
    }
    _insertSnippetMenu() {
        return this.snippetsMenu.insertBefore(this.$el);
    }
    /**
     * If the element holds a translation, saves it. Otherwise, fallback to the
     * standard saving but with the lang kept.
     *
     * @override
     */
    _saveTranslationElement($el, context, withLang = true) {
        if ($el.data('oe-translation-initial-sha')) {
            const $els = $el;
            const translations = {};
            translations[context.lang] = Object.assign({}, ...$els.toArray().map(
                (x) => ({
                    [$(x).data('oe-translation-initial-sha')]: this._getEscapedElement($(x)).html()
                })
            ));
            return this.orm.call(
                $els.data('oe-model'),
                'update_field_translations_sha',
                [
                    [+$els.data('oe-id')],
                    $els.data('oe-field'),
                    translations,
                ], { context });
        } else {
            var viewID = $el.data('oe-id');
            if (!viewID) {
                return Promise.resolve();
            }

            return this.orm.call(
                'ir.ui.view',
                'save',
                [
                    viewID,
                    this._getEscapedElement($el).prop('outerHTML'),
                    !$el.data('oe-expression') && $el.data('oe-xpath') || null, // Note: hacky way to get the oe-xpath only if not a t-field
                ], { context }
            );
        }
    }
    _getPowerboxOptions() {
        const editorOptions = this.options;
        const categories = [];
        const commands = [
            {
                category: _t('Structure'),
                name: _t('Quote'),
                priority: 30,
                description: _t('Add a blockquote section'),
                fontawesome: 'fa-quote-right',
                isDisabled: () => !this.odooEditor.isSelectionInBlockRoot(),
                callback: () => {
                    this.odooEditor.execCommand('setTag', 'blockquote');
                },
            },
            {
                category: _t('Structure'),
                name: _t('Code'),
                priority: 20,
                description: _t('Add a code section'),
                fontawesome: 'fa-code',
                isDisabled: () => !this.odooEditor.isSelectionInBlockRoot(),
                callback: () => {
                    this.odooEditor.execCommand('setTag', 'pre');
                },
            },
            {
                category: _t('Basic blocks'),
                name: _t('Signature'),
                description: _t('Insert your signature'),
                fontawesome: 'fa-pencil-square-o',
                isDisabled: () => !this.odooEditor.isSelectionInBlockRoot(),
                callback: async () => {
                    const [user] = await this.orm.read(
                        'res.users',
                        [session.uid],
                        ['signature'],
                    );
                    if (user && user.signature) {
                        this.odooEditor.execCommand('insert', parseHTML(user.signature));
                    }
                },
            },
        ];
        if (!editorOptions.inlineStyle) {
            commands.push(
                {
                    category: _t('Structure'),
                    name: _t('2 columns'),
                    priority: 13,
                    description: _t('Convert into 2 columns'),
                    fontawesome: 'fa-columns',
                    callback: () => this.odooEditor.execCommand('columnize', 2, editorOptions.insertParagraphAfterColumns),
                    isDisabled: () => {
                        if (!this.odooEditor.isSelectionInBlockRoot()) {
                            return true;
                        }
                        const anchor = this.odooEditor.document.getSelection().anchorNode;
                        const row = closestElement(anchor, '.o_text_columns .row');
                        return row && row.childElementCount === 2;
                    },
                },
                {
                    category: _t('Structure'),
                    name: _t('3 columns'),
                    priority: 12,
                    description: _t('Convert into 3 columns'),
                    fontawesome: 'fa-columns',
                    callback: () => this.odooEditor.execCommand('columnize', 3, editorOptions.insertParagraphAfterColumns),
                    isDisabled: () => {
                        if (!this.odooEditor.isSelectionInBlockRoot()) {
                            return true;
                        }
                        const anchor = this.odooEditor.document.getSelection().anchorNode;
                        const row = closestElement(anchor, '.o_text_columns .row');
                        return row && row.childElementCount === 3;
                    },
                },
                {
                    category: _t('Structure'),
                    name: _t('4 columns'),
                    priority: 11,
                    description: _t('Convert into 4 columns'),
                    fontawesome: 'fa-columns',
                    callback: () => this.odooEditor.execCommand('columnize', 4, editorOptions.insertParagraphAfterColumns),
                    isDisabled: () => {
                        if (!this.odooEditor.isSelectionInBlockRoot()) {
                            return true;
                        }
                        const anchor = this.odooEditor.document.getSelection().anchorNode;
                        const row = closestElement(anchor, '.o_text_columns .row');
                        return row && row.childElementCount === 4;
                    },
                },
                {
                    category: _t('Structure'),
                    name: _t('Remove columns'),
                    priority: 10,
                    description: _t('Back to one column'),
                    fontawesome: 'fa-columns',
                    callback: () => this.odooEditor.execCommand('columnize', 0),
                    isDisabled: () => {
                        if (!this.odooEditor.isSelectionInBlockRoot()) {
                            return true;
                        }
                        const anchor = this.odooEditor.document.getSelection().anchorNode;
                        const row = closestElement(anchor, '.o_text_columns .row');
                        return !row;
                    },
                },
                {
                    category: _t('Widgets'),
                    name: _t('Emoji'),
                    priority: 70,
                    description: _t('Add an emoji'),
                    fontawesome: 'fa-smile-o',
                    callback: () => {
                        this.showEmojiPicker();
                    },
                },
            );
        }
        if (editorOptions.allowCommandLink) {
            categories.push({ name: _t('Navigation'), priority: 40 });
            commands.push(
                {
                    category: _t('Navigation'),
                    name: _t('Link'),
                    priority: 40,
                    description: _t('Add a link'),
                    fontawesome: 'fa-link',
                    callback: () => {
                        this.toggleLinkTools({forceDialog: true});
                    },
                },
                {
                    category: _t('Navigation'),
                    name: _t('Button'),
                    priority: 30,
                    description: _t('Add a button'),
                    fontawesome: 'fa-link',
                    callback: () => {
                        this.toggleLinkTools({forceDialog: true});
                        // Force the button style after the link modal is open.
                        setTimeout(() => {
                            $(".o_link_dialog .link-style[value=primary]").click();
                        }, 150);
                    },
                },
            );
        }
        if (editorOptions.allowCommandImage || editorOptions.allowCommandVideo) {
            categories.push({ name: _t('Media'), priority: 50 });
        }
        if (editorOptions.allowCommandImage) {
            commands.push({
                category: _t('Media'),
                name: _t('Image'),
                priority: 40,
                description: _t('Insert an image'),
                fontawesome: 'fa-file-image-o',
                callback: () => {
                    this.openMediaDialog();
                },
            });
        }
        if (editorOptions.allowCommandVideo) {
            commands.push({
                category: _t('Media'),
                name: _t('Video'),
                priority: 30,
                description: _t('Insert a video'),
                fontawesome: 'fa-file-video-o',
                callback: () => {
                    this.openMediaDialog({noVideos: false, noImages: true, noIcons: true, noDocuments: true});
                },
            });
        }
        if (editorOptions.powerboxCategories) {
            categories.push(...editorOptions.powerboxCategories);
        }
        if (editorOptions.powerboxCommands) {
            commands.push(...editorOptions.powerboxCommands);
        }
        return {commands, categories};
    }

    /**
     * Returns the editable areas on the page.
     *
     * @returns {jQuery}
     */
    editable() {
        return $('#wrapwrap [data-oe-model]')
            .not('.o_not_editable')
            .filter(function () {
                return !$(this).closest('.o_not_editable').length;
            })
            .not('link, script')
            .not('[data-oe-readonly]')
            .not('img[data-oe-field="arch"], br[data-oe-field="arch"], input[data-oe-field="arch"]')
            .not('.oe_snippet_editor')
            .add('.o_editable');
    }

    /**
     * Searches all the dirty element on the page and saves them one by one. If
     * one cannot be saved, this notifies it to the user and restarts rte
     * edition.
     *
     * @param {Object} [context] - the context to use for saving rpc, default to
     *                           the editor context found on the page
     * @return {Promise} rejected if the save cannot be done
     */
    _saveViewBlocks(context) {
        // TODO should be review to probably not search in the whole body,
        // iframe or not.
        const $ = (this.$editable[0].ownerDocument.defaultView.$ || window.$);
        const $allBlocks = $((this.options || {}).savableSelector).filter('.o_dirty');

        const $dirty = $('.o_dirty');
        $dirty
            .removeAttr('contentEditable')
            .removeClass('o_dirty oe_carlos_danger o_is_inline_editable');

        $('.o_editable')
            .removeClass('o_editable o_is_inline_editable o_editable_date_field_linked o_editable_date_field_format_changed');

        const saveElementFuncName = this.options.enableTranslation
            ? '_saveTranslationElement'
            : '_saveElement';

        // Group elements to save if possible.
        const groupedElements = groupBy($allBlocks.toArray(), el => {
            const model = el.dataset.oeModel;
            const field = el.dataset.oeField;

            // There are elements which have no linked model as something
            // special is to be done "to save them" (potential override to
            // `_saveElement` which is expected to be called for each unique
            // dirty element). In that case, do not group those elements.
            if (!model) {
                return uniqueId("special-element-to-save-");
            }

            // Do not group elements which are parts of views, unless we are
            // in translate mode.
            if (!this.options.enableTranslation
                    && (model === 'ir.ui.view' && field === 'arch')) {
                return uniqueId("view-part-to-save-");
            }

            // Otherwise, group elements which are from the same field of the
            // same record (`_saveElement` will only consider the first one and
            // `_saveTranslationElement` can handle the set if it makes sense).
            return `${model}::${el.dataset.oeId}::${field}`;
        });
        const proms = Object.values(groupedElements).map(els => {
            const $els = $(els);

            $els.find('[class]').filter(function () {
                if (!this.getAttribute('class').match(/\S/)) {
                    this.removeAttribute('class');
                }
            });

            // TODO: Add a queue with concurrency limit in webclient
            return this.saving_mutex.exec(() => {
                return this[saveElementFuncName]($els, context || this.options.context)
                .then(function () {
                    $els.removeClass('o_dirty');
                }).guardedCatch(function (response) {
                    // because ckeditor regenerates all the dom, we can't just
                    // setup the popover here as everything will be destroyed by
                    // the DOM regeneration. Add markings instead, and returns a
                    // new rejection with all relevant info
                    var id = uniqueId("carlos_danger_");
                    $els.addClass('o_dirty o_editable oe_carlos_danger ' + id);
                    $('.o_editable.' + id)
                        .removeClass(id)
                        .popover({
                            trigger: 'hover',
                            content: response.message.data.message || '',
                            placement: 'auto',
                        })
                        .popover('show');
                });
            });
        });
        return Promise.all(proms).then(function () {
            window.onbeforeunload = null;
        }).guardedCatch((failed) => {
            // If there were errors, re-enable edition
            this.cancel(false);
        });
    }
    // TODO unused => remove or reuse as it should be
    _attachTooltips() {
        $(document.body)
            .tooltip({
                selector: '[data-oe-readonly]',
                container: 'body',
                trigger: 'hover',
                delay: {'show': 1000, 'hide': 100},
                placement: 'bottom',
                title: _t("Readonly field")
            })
            .on('click', function () {
                $(this).tooltip('hide');
            });
    }
    /**
     * Gets jQuery cloned element with internal text nodes escaped for XML
     * storage.
     *
     * @private
     * @param {jQuery} $el
     * @return {jQuery}
     */
    _getEscapedElement($el) {
        var escaped_el = $el.clone();
        var to_escape = escaped_el.find('*').addBack();
        to_escape = to_escape.not(to_escape.filter('object,iframe,script,style,[data-oe-model][data-oe-model!="ir.ui.view"]').find('*').addBack());
        to_escape.contents().each(function () {
            if (this.nodeType === 3) {
                this.nodeValue = $('<div />').text(this.nodeValue).html();
            }
        });
        return escaped_el;
    }
    /**
     * Saves one (dirty) element of the page.
     *
     * @private
     * @param {jQuery} $el - the element to save
     * @param {Object} context - the context to use for the saving rpc
     */
    async _saveElement($el, context) {
        var viewID = $el.data('oe-id');
        if (!viewID) {
            return Promise.resolve();
        }

        // remove ZeroWidthSpace from odoo field value
        // ZeroWidthSpace may be present from OdooEditor edition process
        let escapedHtml = this._getEscapedElement($el).prop('outerHTML');

        const result = this.orm.call('ir.ui.view', 'save', [
            viewID,
            escapedHtml,
            !$el.data('oe-expression') && $el.data('oe-xpath') || null
        ], {
            context,
        });
        return result;
    }

    /**
     * Reloads the page in non-editable mode, with the right scrolling.
     *
     * @private
     * @returns {Promise} (never resolved, the page is reloading anyway)
     */
    _reload() {
        window.location.hash = 'scrollTop=' + window.document.body.scrollTop;
        if (window.location.search.indexOf('enable_editor') >= 0) {
            window.location.href = window.location.href.replace(/&?enable_editor(=[^&]*)?/g, '');
        } else {
            window.location.reload(true);
        }
        return new Promise(function () {});
    }
    _onAttachmentChange(attachment) {
        // todo: to remove when removing the legacy field_html
        // this.trigger_up('attachment_changed', attachment);
        if (this.options.onAttachmentChange) {
            this.options.onAttachmentChange(attachment);
        }
    }
    _onDblClickEditableMedia(ev) {
        const $el = $(ev.target);
        $el.selectElement();
        if (!$el.parent().hasClass('o_stars')) {
            // Waiting for all the options to be initialized before
            // opening the media dialog and only if the media has not
            // been deleted in the meantime.
            this.waitForEmptyMutexAction().then(() => {
                if ($el[0].parentElement) {
                    this.openMediaDialog({ node: ev.target });
                }
            });
        }
    }
    _onSelectionChange() {
        if (this.odooEditor.autohideToolbar) {
            const isVisible = this.linkPopover && this.linkPopover.el.offsetParent;
            if (isVisible && !this.odooEditor.document.getSelection().isCollapsed) {
                this.linkPopover.hide();
            }
        }
    }
    _onDocumentMousedown(e) {
        if (!e.target.classList.contains('o_editable_date_field_linked')) {
            this.$editable.find('.o_editable_date_field_linked').removeClass('o_editable_date_field_linked');
        }
        const closestDialog = e.target.closest('.o_dialog, .o_web_editor_dialog');
        if (e.target.closest('.oe-toolbar') || e.target.closest('.o_we_crop_buttons') || (closestDialog && closestDialog.querySelector('.o_select_media_dialog, .o_link_dialog'))) {
            this._shouldDelayBlur = true;
        } else {
            if (this._pendingBlur && !e.target.closest('.o_wysiwyg_wrapper')) {
                // todo: to remove when removing the legacy field_html
                // this.trigger_up('wysiwyg_blur');
                this.options.onWysiwygBlur && this.options.onWysiwygBlur();
                this._pendingBlur = false;
            }
            this._shouldDelayBlur = false;
        }
    }
    _onBlur() {
        if (this._shouldDelayBlur) {
            this._pendingBlur = true;
        } else {
            // todo: to remove when removing the legacy field_html
            // this.trigger_up('wysiwyg_blur');
            this.options.onWysiwygBlur && this.options.onWysiwygBlur();
        }
    }
    _signalOffline() {
        if (!this._isOnline) {
            return;
        }
        this._isOnline = false;

        this.preSavePromise = new Promise((resolve, reject) => {
            this.preSavePromiseResolve = resolve;
            this.preSavePromiseReject = reject;
        });
    }
    async _signalOnline() {
        clearTimeout(this._offlineTimeout);
        this._offlineTimeout = undefined;

        if (this._isOnline || !this.preSavePromise || !navigator.onLine) {
            return;
        }
        this._isOnline = true;

        if (this._removeSignalDisconnectCallback) {
            this._removeSignalDisconnectCallback();
        }
        const resetPreSavePromise = () => {
            this.preSavePromise = undefined;
            this.preSavePromiseResolve = undefined;
            this.preSavePromiseReject = undefined;
        }
        try {
            const serverContent = await this._ensureCommonHistory();
            if (serverContent) {
                const content = markup(this.odooEditor.editable.cloneNode(true).outerHTML);
                this.env.services.dialog.add(ConflictDialog, { content });

                await this.resetEditor(serverContent);
                // We were in a peer to peer session before the conflict, join
                // it again immediately.
                this._joinPeerToPeer();
            }
            this.preSavePromiseResolve();
            resetPreSavePromise();
        } catch (e) {
            this.preSavePromiseReject(e);
            resetPreSavePromise();
        }
    }
    _getInitialHistoryId(value) {
        const matchId = value.match(/data-last-history-steps="(?:[0-9]+,)*([0-9]+)"/);
        return matchId && matchId[1];
    }
    /**
     * When the collaboration is active, ensure that we do not try to save with
     * a different history branch to the database. If the history is different,
     * return the database html content.
     *
     * See `_historyIds` in `historyReset` in OdooEditor.
     *
     * @return {string} The database html content if the history is different.
     */
    async _ensureCommonHistory() {
        if (!this.ptp) return;
        const historyIds = this.odooEditor.historyGetBranchIds();
        return this._serviceRpc(
            '/web_editor/ensure_common_history',
            {
                history_ids: historyIds,
                model_name: this.options.collaborationChannel.collaborationModelName,
                field_name: this.options.collaborationChannel.collaborationFieldName,
                res_id: this.options.collaborationChannel.collaborationResId,
            },
        );
    }
    _generateClientId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
    _stopPeerToPeer() {
        this.ptp && this.ptp.stop();
        this._collaborationStopBus && this._collaborationStopBus();
    }
    _joinPeerToPeer() {
        this.$editable[0].removeEventListener('focus', this._joinPeerToPeer);
        if (this._peerToPeerLoading) {
            this._peerToPeerLoading.then(() => this.ptp.notifyAllClients('ptp_join'));
        }
    }
    async resetEditor(value, options) {
        await this._peerToPeerLoading;
        this.$editable[0].removeEventListener('focus', this._joinPeerToPeer);
        if (options) {
            this.options = this._getEditorOptions(options);
        }
        const {collaborationChannel} = this.options;
        this._stopPeerToPeer();
        this._rulesCache = undefined; // Reset the cache of rules.
        // If there is no collaborationResId, the record has been deleted.
        if (!collaborationChannel || !collaborationChannel.collaborationResId) {
            this.setValue(value);
            this.odooEditor.historyReset();
            return;
        }
        this.setValue(value);
        this.setupCollaboration(collaborationChannel);
        this.odooEditor.collaborationSetClientId(this._currentClientId);
        this.odooEditor.historyReset();
        if (this.options.collaborativeTrigger === 'start') {
            this._joinPeerToPeer();
        } else if (this.options.collaborativeTrigger === 'focus') {
            // Wait until editor is focused to join the peer to peer network.
            this.$editable[0].addEventListener('focus', this._joinPeerToPeer);
        }
        const initialHistoryId = value && this._getInitialHistoryId(value);
        if (initialHistoryId) {
            this.odooEditor.historySetInitialId(initialHistoryId);
        }
        await this._peerToPeerLoading;
    }
    /**
     * Set contenteditable=false for all `.o_not_editable` found within node if
     * node is an element.
     *
     * For all `.o_not_editable` element found, the attribute contenteditable
     * will be removed if the class is removed.
     *
     * @param {Node} node
     */
    _setONotEditable(node) {
        const nodes = (node && node.querySelectorAll && node.querySelectorAll('.o_not_editable:not([contenteditable=false])')) || [];
        for (const node of nodes) {
            node.setAttribute('contenteditable', false);
            let observer = this._oNotEditableObservers.get(node);
            if (!observer) {
                observer = new MutationObserver((records) => {
                    for (const record of records) {
                        if (record.type === 'attributes' && record.attributeName === 'class') {
                            // Remove contenteditable=false on nodes that were
                            // previsouly o_not_editable but are no longer
                            // o_not_editable.
                            if (!node.classList.contains('o_not_editable')) {
                                this.odooEditor.observerUnactive('_setONotEditable');
                                node.removeAttribute('contenteditable');
                                this.odooEditor.observerActive('_setONotEditable');
                                observer.disconnect();
                                this._oNotEditableObservers.delete(node);
                            }
                        }
                    }
                });
                this._oNotEditableObservers.set(node, observer);
                observer.observe(node, {
                    attributes: true,
                });
            }
        }
    }
    _attachHistoryIds(editable = this.odooEditor.editable) {
        if (this.options.collaborative) {
            const historyIds = this.odooEditor.historyGetBranchIds().join(',');
            const firstChild = editable.children[0];
            if (firstChild) {
                firstChild.setAttribute('data-last-history-steps', historyIds);
            }
        }
    }
    _bindOnBlur() {
        this.$editable.on('blur', this._onBlur);
    }
    /**
     * Saves a base64 encoded image as an attachment.
     * Relies on _saveModifiedImage being called after it for webp.
     *
     * @private
     * @param {Element} el
     * @param {string} resModel
     * @param {number} resId
     */
    async _saveB64Image(el, resModel, resId) {
        const attachment = await this._serviceRpc(
            '/web_editor/attachment/add_data',
            {
                name: el.dataset.fileName || '',
                data: el.getAttribute('src').split(',')[1],
                is_image: true,
            },
        );
        if (attachment.mimetype === 'image/webp') {
            el.classList.add('o_modified_image_to_save');
            el.dataset.originalId = attachment.id;
            el.dataset.mimetype = attachment.mimetype;
            el.dataset.fileName = attachment.name;
            this._saveModifiedImage(el, resModel, resId);
        } else {
            el.setAttribute('src', attachment.image_src);
        }
        el.classList.remove('o_b64_image_to_save');
    }
    /**
     * Saves a modified image as an attachment.
     *
     * @private
     * @param {Element} el
     * @param {string} resModel
     * @param {number} resId
     */
    async _saveModifiedImage(el, resModel, resId) {
        const isBackground = !el.matches('img');
        el.classList.remove('o_modified_image_to_save');
        // Modifying an image always creates a copy of the original, even if
        // it was modified previously, as the other modified image may be used
        // elsewhere if the snippet was duplicated or was saved as a custom one.
        let altData = undefined;
        if (el.dataset.mimetype === 'image/webp') {
            // Generate alternate sizes and format for reports.
            altData = {};
            const image = document.createElement('img');
            image.src = isBackground ? el.dataset.bgSrc : el.getAttribute('src');
            await new Promise(resolve => image.addEventListener('load', resolve));
            const originalSize = Math.max(image.width, image.height);
            const smallerSizes = [1024, 512, 256, 128].filter(size => size < originalSize);
            for (const size of [originalSize, ...smallerSizes]) {
                const ratio = size / originalSize;
                const canvas = document.createElement('canvas');
                canvas.width = image.width * ratio;
                canvas.height = image.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgb(255, 255, 255)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
                altData[size] = {
                    'image/jpeg': canvas.toDataURL('image/jpeg', 0.75).split(',')[1],
                };
                if (size !== originalSize) {
                    altData[size]['image/webp'] = canvas.toDataURL('image/webp', 0.75).split(',')[1];
                }
            }
        }
        const newAttachmentSrc = await this._serviceRpc(
            `/web_editor/modify_image/${encodeURIComponent(el.dataset.originalId)}`,
            {
                res_model: resModel,
                res_id: parseInt(resId),
                data: (isBackground ? el.dataset.bgSrc : el.getAttribute('src')).split(',')[1],
                alt_data: altData,
                mimetype: el.getAttribute('src').split(":")[1].split(";")[0],
                name: (el.dataset.fileName ? el.dataset.fileName : null),
            },
        );
        if (isBackground) {
            const parts = weUtils.backgroundImageCssToParts($(el).css('background-image'));
            parts.url = `url('${newAttachmentSrc}')`;
            const combined = weUtils.backgroundImagePartsToCss(parts);
            $(el).css('background-image', combined);
            delete el.dataset.bgSrc;
        } else {
            el.setAttribute('src', newAttachmentSrc);
        }
    }

    _trigger_up(ev) {
        const evType = ev.name;
        const payload = ev.data;
        if (evType === 'call_service') {
            this._callService(payload);
        } else if (evType === 'get_session') {
            if (payload.callback) {
                payload.callback(this.env.session);
            }
        } else if (evType === 'load_views') {
            const params = {
                model: payload.modelName,
                context: payload.context,
                views_descr: payload.views,
            };
            this.env.dataManager
                .load_views(params, payload.options || {})
                .then(payload.on_success);
        } else if (evType === 'load_filters') {
            return this.env.dataManager
                .load_filters(payload)
                .then(payload.on_success);
        }
    }
    _callService(payload) {
        let args = payload.args || [];
        if (payload.service === 'ajax' && payload.method === 'rpc') {
            // ajax service uses an extra 'target' argument for rpc
            const [route, params, settings = {}] = args;
            if (params && params.kwargs) {
                params.kwargs.context = {
                    // ...this.env.session.user_context,
                    ...this.env.services.user.context,
                    ...params.kwargs.context,
                };
            }
            const result = this._serviceRpc(route, params, settings);
            payload.callback(result);
            return;
        }
        const service = this.env.services[payload.service];
        //If the service doesn't exist it means that it was translated to Owl
        if (service) {
            const result = service[payload.method].apply(service, args);
            payload.callback(result);
        } else {
            throw new Error(
                `The service "${payload.service}" is not present in the legacy owl environment.
                    You should probably create a mapper in @web/legacy/utils`
            );
        }
    }
    _serviceRpc(route, params, settings = {}) {
        if (params && params.kwargs) {
            params.kwargs.context = {
                ...this.env.services.user.context,
                ...params.kwargs.context,
            };
        }
        return this.env.services.rpc(route, params, {
            silent: settings.shadow,
            xhr: settings.xhr,
        });
    }
    _rpc({ route,  params }) {
        return this._serviceRpc(route, params)
    }
    _useService(serviceName) {
        return useService(serviceName);
    }
    _getColorpickerArch() {
        return this.orm.call(
            'ir.ui.view',
            'render_public_asset',
            ['web_editor.colorpicker', {}]
        )
    }
}
Wysiwyg.activeCollaborationChannelNames = new Set();
Wysiwyg.activeWysiwygs = new Set();
//--------------------------------------------------------------------------
// Public helper
//--------------------------------------------------------------------------
/**
 * @param {Node} [ownerDocument] (document on which to get the selection)
 * @returns {Object}
 * @returns {Node} sc - start container
 * @returns {Number} so - start offset
 * @returns {Node} ec - end container
 * @returns {Number} eo - end offset
 */
Wysiwyg.getRange = function (ownerDocument) {
    const selection = (ownerDocument || document).getSelection();
    if (selection.rangeCount === 0) {
        return {
            sc: null,
            so: 0,
            ec: null,
            eo: 0,
        };
    }
    const range = selection.getRangeAt(0);

    return {
        sc: range.startContainer,
        so: range.startOffset,
        ec: range.endContainer,
        eo: range.endOffset,
    };
};
/**
 * @param {Node} startNode
 * @param {Number} startOffset
 * @param {Node} endNode
 * @param {Number} endOffset
 */
Wysiwyg.setRange = function (startNode, startOffset = 0, endNode = startNode, endOffset = startOffset) {
    const selection = document.getSelection();
    selection.removeAllRanges();

    const range = new Range();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    selection.addRange(range);
};

export function stripHistoryIds(value) {
    return value && value.replace(/\sdata-last-history-steps="[^"]*?"/, '') || value;
}
