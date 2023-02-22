/** @odoo-module **/

import {
    Component,
    onWillUnmount,
    useEffect,
    useExternalListener,
    useRef,
    useState,
} from "@odoo/owl";
import { reposition } from "@web/core/position_hook";
import { throttleForAnimation } from "@web/core/utils/timing";

/**
 * @typedef {import("../tour_service/tour_pointer_state").TourPointerState} TourPointerState
 *
 * @typedef TourPointerProps
 * @property {TourPointerState} pointerState
 * @property {(pointerState: Partial<TourPointerState>) => void} setPointerState
 */

/** @extends {Component<TourPointerProps, any>} */
export class TourPointer extends Component {
    static props = {
        pointerState: {
            type: Object,
            shape: {
                anchor: { type: HTMLElement, optional: true },
                content: { type: String, optional: true },
                fixed: { type: Boolean, optional: true },
                isOpen: { type: Boolean, optional: true },
                isVisible: { type: Boolean, optional: true },
                position: {
                    type: [
                        { value: "left" },
                        { value: "right" },
                        { value: "top" },
                        { value: "bottom" },
                    ],
                    optional: true,
                },
            },
        },
    };

    static template = "web_tour.TourPointer";
    static width = 28; // in pixels
    static height = 28; // in pixels

    setup() {
        const rootRef = useRef("popper");
        /** @type {DOMREct | null} */
        this.dimensions = null;
        this.state = useState({ isOpen: false });
        let lastMeasuredContent = null;
        let lastOpenState = this.isOpen;

        const repositionPointer = () => {
            const { el } = rootRef;
            const { anchor } = this.props.pointerState;
            if (el && anchor) {
                const { x, width } = anchor.getBoundingClientRect();
                const wouldOverflow = window.innerWidth - x - width / 2 < this.dimensions?.width;
                el.classList.toggle("o_expand_left", wouldOverflow);

                reposition(anchor, el, { position: this.position });
            }
        };

        useEffect(() => {
            const { el } = rootRef;
            if (el) {
                const hasContentChanged = lastMeasuredContent !== this.content;
                const hasOpenStateChanged = lastOpenState !== this.isOpen;
                lastOpenState = this.isOpen;

                // Content changed: we must re-measure the dimensions of the text.
                if (hasContentChanged) {
                    lastMeasuredContent = this.content;
                    el.style.removeProperty("width");
                    el.style.removeProperty("height");
                    this.dimensions = el.getBoundingClientRect();
                }

                // If the content or the "is open" state changed: we must apply
                // new width and height properties
                if (hasContentChanged || hasOpenStateChanged) {
                    const [width, height] = this.isOpen
                        ? [this.dimensions.width, this.dimensions.height]
                        : [this.constructor.width, this.constructor.height];
                    if (this.isOpen) {
                        el.style.removeProperty("transition");
                    } else {
                        // No transition if switching from open to closed
                        el.style.setProperty("transition", "none");
                    }
                    el.style.setProperty("width", `${width}px`);
                    el.style.setProperty("height", `${height}px`);

                    repositionPointer();
                }
            }
        });

        const throttledUpdate = throttleForAnimation(repositionPointer);
        useExternalListener(document, "scroll", throttledUpdate, { capture: true });
        useExternalListener(window, "resize", throttledUpdate);
        onWillUnmount(throttledUpdate.cancel);
    }

    get content() {
        return this.props.pointerState.content || "";
    }

    get isOpen() {
        return this.state.isOpen || this.props.pointerState.isOpen;
    }

    get position() {
        return this.props.pointerState.position || "top";
    }
}
