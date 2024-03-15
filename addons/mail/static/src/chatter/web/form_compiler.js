import { registry } from "@web/core/registry";
import { SIZES } from "@web/core/ui/ui_service";
import { patch } from "@web/core/utils/patch";
import { append, createElement, setAttributes } from "@web/core/utils/xml";
import { FormCompiler } from "@web/views/form/form_compiler";

function compileChatter(node, params) {
    const chatterContainerXml = createElement("t");
    setAttributes(chatterContainerXml, {
        "t-component": "__comp__.mailComponents.Chatter",
        has_activities: "__comp__.props.archInfo.has_activities",
        hasParentReloadOnAttachmentsChanged: Boolean(node.getAttribute("reload_on_attachment")),
        hasParentReloadOnFollowersUpdate: Boolean(node.getAttribute("reload_on_follower")),
        hasParentReloadOnMessagePosted: Boolean(node.getAttribute("reload_on_post")),
        isAttachmentBoxVisibleInitially: Boolean(node.getAttribute("open_attachments")),
        threadId: "__comp__.props.record.resId or undefined",
        threadModel: "__comp__.props.record.resModel",
        webRecord: "__comp__.props.record",
        saveRecord: "() => __comp__.save and __comp__.save()",
    });
    const chatterContainerHookXml = createElement("div");
    chatterContainerHookXml.classList.add("o-mail-Form-chatter");
    append(chatterContainerHookXml, chatterContainerXml);
    return chatterContainerHookXml;
}

function compileAttachmentPreview(node, params) {
    const webClientViewAttachmentViewContainerHookXml = createElement("div");
    webClientViewAttachmentViewContainerHookXml.classList.add("o_attachment_preview");
    const webClientViewAttachmentViewContainerXml = createElement("t");
    setAttributes(webClientViewAttachmentViewContainerXml, {
        "t-component": "__comp__.mailComponents.AttachmentView",
        threadId: "__comp__.props.record.resId or undefined",
        threadModel: "__comp__.props.record.resModel",
    });
    append(webClientViewAttachmentViewContainerHookXml, webClientViewAttachmentViewContainerXml);
    return webClientViewAttachmentViewContainerHookXml;
}

registry.category("form_compilers").add("chatter_compiler", {
    selector: "chatter",
    fn: compileChatter,
});

registry.category("form_compilers").add("attachment_preview_compiler", {
    selector: "div.o_attachment_preview",
    fn: compileAttachmentPreview,
});

patch(FormCompiler.prototype, {
    compile(node, params) {
        // TODO no chatter if in dialog?
        const res = super.compile(node, params);
        const chatterContainerHookXml = res.querySelector(".o-mail-Form-chatter");
        if (!chatterContainerHookXml) {
            return res; // no chatter, keep the result as it is
        }
        const chatterContainerXml = chatterContainerHookXml.querySelector(
            "t[t-component='__comp__.mailComponents.Chatter']"
        );
        setAttributes(chatterContainerXml, {
            isChatterAside: "false",
            isInFormSheetBg: "false",
            saveRecord: "__comp__.props.saveRecord",
        });
        if (chatterContainerHookXml.parentNode.classList.contains("o_form_sheet")) {
            return res; // if chatter is inside sheet, keep it there
        }
        const formSheetBgXml = res.querySelector(".o_form_sheet_bg");
        const parentXml = formSheetBgXml && formSheetBgXml.parentNode;
        if (!parentXml) {
            return res; // miss-config: a sheet-bg is required for the rest
        }

        const webClientViewAttachmentViewHookXml = res.querySelector(".o_attachment_preview");
        if (webClientViewAttachmentViewHookXml) {
            // in sheet bg (attachment viewer present)
            setAttributes(webClientViewAttachmentViewHookXml, {
                "t-if": `__comp__.hasFileViewer() and __comp__.uiService.size >= ${SIZES.XXL}`,
            });
            const sheetBgChatterContainerHookXml = chatterContainerHookXml.cloneNode(true);
            sheetBgChatterContainerHookXml.classList.add("o-isInFormSheetBg", "w-auto");
            setAttributes(sheetBgChatterContainerHookXml, {
                "t-if": `__comp__.hasFileViewer() and __comp__.uiService.size >= ${SIZES.XXL}`,
            });
            append(formSheetBgXml, sheetBgChatterContainerHookXml);
            const sheetBgChatterContainerXml = sheetBgChatterContainerHookXml.querySelector(
                "t[t-component='__comp__.mailComponents.Chatter']"
            );
            setAttributes(sheetBgChatterContainerXml, {
                isInFormSheetBg: "true",
                isChatterAside: "false",
            });
        }
        // after sheet bg (standard position, either aside or below)
        if (webClientViewAttachmentViewHookXml) {
            setAttributes(chatterContainerHookXml, {
                "t-if": `!(__comp__.hasFileViewer() and __comp__.uiService.size >= ${SIZES.XXL})`,
                "t-attf-class": `{{ __comp__.uiService.size >= ${SIZES.XXL} and !(__comp__.hasFileViewer() and __comp__.uiService.size >= ${SIZES.XXL}) ? "o-aside" : "" }}`,
            });
            setAttributes(chatterContainerXml, {
                isInFormSheetBg: "__comp__.hasFileViewer()",
                isChatterAside: `__comp__.uiService.size >= ${SIZES.XXL} and !(__comp__.hasFileViewer() and __comp__.uiService.size >= ${SIZES.XXL})`,
            });
        } else {
            setAttributes(chatterContainerXml, {
                isInFormSheetBg: "false",
                isChatterAside: `__comp__.uiService.size >= ${SIZES.XXL}`,
            });
            setAttributes(chatterContainerHookXml, {
                "t-attf-class": `{{ __comp__.uiService.size >= ${SIZES.XXL} ? "o-aside" : "mt-4 mt-md-0" }}`,
            });
        }
        append(parentXml, chatterContainerHookXml);
        return res;
    },
});
