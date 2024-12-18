import { renderToElement } from "@web/core/utils/render";

// @todo: the caller must clone it to use the right document.
export function renderStaticFileCard(filename, mimetype, downloadUrl) {
    // consider adding this to a template that t-calls the template below
    const rootSpan = document.createElement("span");
    rootSpan.classList.add("o_file_card");
    rootSpan.contentEditable = false;
    const bannerElement = renderToElement("html_editor.staticFileBanner", {
        fileModel: { filename, mimetype, downloadUrl },
    });
    rootSpan.append(bannerElement);
    return rootSpan;
}
