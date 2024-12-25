document.addEventListener('DOMContentLoaded', () => {
    const htmlEl = document.documentElement;
    const editTranslations = !!htmlEl.dataset.edit_translations;
    // Hack: on translation editor, textareas with translatable text content
    // will get a `<span/>` as translation value which stays visible until
    // the values are updated on the editor. The same issue was fixed on CSS
    // for `placeholder` and `value` attributes (since we can get the elements
    // with attribute translation on CSS). But here, we need to hide the text
    // on JS until the editor's code sets the right values on textareas.
    if (editTranslations) {
        [...document.querySelectorAll('textarea')].map(textarea => {
            if (textarea.value.indexOf('data-oe-translation-source-sha') !== -1) {
                textarea.classList.add('o_text_content_invisible');
            }
        });
    }
    // Hack: we move the '#o_search_modal' from the '#header' to
    // '#o_search_modal_block'. Without this change, when the header has a
    // 'transform: translate' (when it's fixed), the modal, which is positioned
    // absolutely, takes the dimensions of the header instead of those of the
    // 'body'.
    const searchModalEl = document.querySelector("header#top .modal#o_search_modal");
    if (searchModalEl) {
        const mainEl = document.querySelector("main");
        const searchDivEl = document.createElement('div');
        searchDivEl.id = "o_search_modal_block";
        searchDivEl.appendChild(searchModalEl);
        mainEl.appendChild(searchDivEl);
    }
    // Hack: on page load we adjust the breadcrumb position.
    adjustBreadcrumb();
});

function adjustBreadcrumb() {
    // Hack: on the header overlay, the breadcrumb should be below the header.
    // checking wheather 'o_header_overlay' class is present on 'wrapwrap' div
    // and adjusting the breadcrumb position accordingly.
    const wrapwrapEl = document?.querySelector("div#wrapwrap");
    const breadcrumbEl = wrapwrapEl?.querySelector("div.o_page_breadcrumb");
    const headerHeight = wrapwrapEl?.querySelector("header#top")?.getBoundingClientRect().height;
    if(breadcrumbEl && headerHeight){
        if (wrapwrapEl.classList.contains("o_header_overlay")) {
            if (!breadcrumbEl.classList.contains("o_header_breadcrumb")) {
                breadcrumbEl.classList.add("o_header_breadcrumb");
            }
            breadcrumbEl.style.top = "";
            breadcrumbEl.style.top = `${headerHeight}px`;
        } else {
            breadcrumbEl.classList.remove("o_header_breadcrumb");
            breadcrumbEl.style.top = "";
        }
    }
}
// binding the adjustBreadcrumb function to window resize event
// as 'resize' is dispatched when changing the position option of the header
// see 'VisibilityPageOptionUpdate` class in snippets.options.js.
window.addEventListener("resize", adjustBreadcrumb);
