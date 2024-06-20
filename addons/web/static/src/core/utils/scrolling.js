/**
 * Get the closest horizontally scrollable for a given element.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
export function closestScrollableX(el) {
    if (!el) {
        return null;
    }
    if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
        const overflow = getComputedStyle(el).getPropertyValue("overflow-x");
        if (/\bauto\b|\bscroll\b/.test(overflow)) {
            return el;
        }
    }
    return closestScrollableX(el.parentElement);
}

/**
 * Get the closest vertically scrollable for a given element.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
export function closestScrollableY(el) {
    if (!el) {
        return null;
    }
    if (el.scrollHeight > el.clientHeight && el.clientHeight > 0) {
        const overflow = getComputedStyle(el).getPropertyValue("overflow-y");
        if (/\bauto\b|\bscroll\b/.test(overflow)) {
            return el;
        }
    }
    return closestScrollableY(el.parentElement);
}

/**
 * Ensures that `element` will be visible in its `scrollable`.
 *
 * @param {HTMLElement} element
 * @param {Object} options
 * @param {HTMLElement} [options.scrollable] a scrollable area
 * @param {Boolean} [options.isAnchor] states if the scroll is to an anchor
 * @param {String} [options.behavior] "smooth", "instant", "auto" <=> undefined
 *        @url https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTo#behavior
 */
export function scrollTo(
    element,
    options = { behavior: "auto", scrollable: null, isAnchor: false }
) {
    const scrollable = closestScrollableY(options.scrollable || element.parentElement);
    if (scrollable) {
        const scrollBottom = scrollable.getBoundingClientRect().bottom;
        const scrollTop = scrollable.getBoundingClientRect().top;
        const elementBottom = element.getBoundingClientRect().bottom;
        const elementTop = element.getBoundingClientRect().top;
        if (elementBottom > scrollBottom && !options.isAnchor) {
            // The scroll place the element at the bottom border of the scrollable
            scrollable.scrollTo({
                top:
                    scrollable.scrollTop +
                    elementTop -
                    scrollBottom +
                    Math.ceil(element.getBoundingClientRect().height),
                behavior: options.behavior,
            });
        } else if (elementTop < scrollTop || options.isAnchor) {
            // The scroll place the element at the top of the scrollable
            scrollable.scrollTo({
                top: scrollable.scrollTop - scrollTop + elementTop,
                behavior: options.behavior,
            });
            if (options.isAnchor) {
                // If the scrollable is within a scrollable, another scroll should be done
                const parentScrollable = closestScrollableY(scrollable.parentElement);
                if (parentScrollable) {
                    scrollTo(scrollable, {
                        behavior: options.behavior,
                        isAnchor: true,
                        scrollable: parentScrollable,
                    });
                }
            }
        }
    }
}

/**
 * Get the closest scrollable for a given element.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
export function closestScrollable(el) {
    if (!el) {
        return null;
    }
    if (el.scrollHeight > el.clientHeight) {
        return el;
    } else {
        return closestScrollable(el.parentElement);
    }
}

/**
 * This method will return the scrolling element of the document.
 *
 * @returns {HTMLElement} the scrolling element
 */
export function getScrollingElement(document = window.document) {
    const baseScrollingElement = document.scrollingElement;
    const isScrollable = (el) => {
        const style = window.getComputedStyle(el).overflowY;
        return (
            style === "scroll" ||
            style === "auto" ||
            (style === "visible" && el === el.ownerDocument.scrollingElement)
        );
    };
    if (
        isScrollable(baseScrollingElement) &&
        baseScrollingElement.scrollHeight > baseScrollingElement.clientHeight
    ) {
        return baseScrollingElement;
    }

    const bodyHeight = document.body.clientHeight;

    for (const el of document.body.children) {
        if (bodyHeight - el.scrollHeight > 1.5) {
            continue;
        }

        if (isScrollable(el)) {
            return el;
        }
    }

    return baseScrollingElement;
}

/**
 *
 * This method returns the scrolling target of a given element.
 *
 * @returns {Window | HTMLElement} the scrolling target
 *
 */
export function getScrollingTarget(contextItem = window.document) {
    const scrollingElement =
        contextItem instanceof Element
            ? contextItem
            : contextItem instanceof jQuery
            ? contextItem[0]
            : getScrollingElement(contextItem);
    const document = scrollingElement.ownerDocument;
    return scrollingElement === document.scrollingElement ? document.defaultView : scrollingElement;
}

/**
 * Adapt the given css property by adding the size of a scrollbar if any.
 * Limitation: only works if the given css property is not already used as
 * inline style for another reason.
 *
 * @param {boolean} [add=true]
 * @param {boolean} [isScrollElement=true]
 * @param {string} [cssProperty='padding-right']
 */
export function compensateScrollbar(
    elements,
    add = true,
    isScrollElement = true,
    cssProperty = "padding-right"
) {
    for (const el of elements.children) {
        // Compensate scrollbar
        const scrollableEl = isScrollElement ? el : closestScrollable(el.parentElement);
        const isRTL = scrollableEl?.classList.contains("o_rtl");
        if (isRTL) {
            cssProperty = cssProperty.replace("right", "left");
        }
        el.style.removeProperty(cssProperty);
        if (!add) {
            return;
        }
        const style = window.getComputedStyle(el);
        // Round up to the nearest integer to be as close as possible to
        // the correct value in case of browser zoom.
        const borderLeftWidth = Math.ceil(parseFloat(style.borderLeftWidth.replace("px", "")));
        const borderRightWidth = Math.ceil(parseFloat(style.borderRightWidth.replace("px", "")));
        const bordersWidth = borderLeftWidth + borderRightWidth;
        const newValue =
            parseInt(style[cssProperty]) +
            scrollableEl?.offsetWidth -
            scrollableEl?.clientWidth -
            bordersWidth;
        el.style.setProperty(cssProperty, `${newValue}px`, "important");
    }
}