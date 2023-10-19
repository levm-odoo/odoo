/** @odoo-module */
import {
    Component,
    onMounted,
    onWillUpdateProps,
    onWillUnmount,
    useEffect,
    useExternalListener,
    useRef,
    useComponent,
} from "@odoo/owl";

function useResizable({
    containerRef,
    handleRef,
    getMinWidth = () => 400,
    onResize = () => {},
    getResizeSide = () => "end",
}) {
    containerRef = typeof containerRef == "string" ? useRef(containerRef) : containerRef;
    handleRef = typeof handleRef == "string" ? useRef(handleRef) : handleRef;
    const props = useComponent().props;

    let minWidth = getMinWidth(props);
    let resizeSide = getResizeSide(props);
    let isChangingSize = false;

    useExternalListener(document, "mouseup", () => onMouseUp());
    useExternalListener(document, "mousemove", (ev) => onMouseMove(ev));

    let docDirection;
    useEffect(
        (container) => {
            if (container) {
                docDirection = getComputedStyle(container).direction;
            }
        },
        () => [containerRef.el]
    );

    onMounted(() => {
        if (handleRef.el) {
            resize(minWidth);
            handleRef.el.addEventListener("mousedown", onMouseDown);
        }
    });

    onWillUpdateProps((nextProps) => {
        minWidth = getMinWidth(nextProps);
        resizeSide = getResizeSide(nextProps);
    });

    onWillUnmount(() => {
        if (handleRef.el) {
            handleRef.el.removeEventListener("mousedown", onMouseDown);
        }
    });

    function onMouseDown() {
        isChangingSize = true;
        document.body.classList.add("pe-none", "user-select-none");
    }

    function onMouseUp() {
        isChangingSize = false;
        document.body.classList.remove("pe-none", "user-select-none");
    }

    function onMouseMove(ev) {
        if (!isChangingSize || !containerRef.el) {
            return;
        }
        const direction =
            (docDirection === "ltr" && resizeSide === "end") ||
            (docDirection === "rtl" && resizeSide === "start")
                ? 1
                : -1;
        const fixedSide = direction === 1 ? "left" : "right";

        const container = containerRef.el;
        const offsetParent = container.offsetParent;
        let limit;
        let containerRect = {};
        if (!offsetParent) {
            containerRect = container.getBoundingClientRect();
            limit = window.innerWidth;
        } else {
            containerRect.left = container.offsetLeft;
            containerRect.right = container.offsetLeft + container.offsetWidth;
            containerRect.width = container.offsetWidth;
            limit = offsetParent.offsetWidth;
        }
        const newWidth = (ev.clientX - containerRect[fixedSide]) * direction;

        const handlerSpacing = handleRef.el ? handleRef.el.offsetWidth / 2 : 10;

        const width = Math.max(minWidth, newWidth + handlerSpacing);
        resize(Math.min(width, limit - handlerSpacing));
    }

    function resize(width) {
        containerRef.el.style.setProperty("min-width", `${width}px`);
        onResize(width);
    }
}

export class ResizablePanel extends Component {
    static template = "web_studio.ResizablePanel";

    static components = {};
    static props = {
        onResize: { type: Function, optional: true },
        minWidth: { type: Number, optional: true },
        class: { type: String, optional: true },
        slots: { type: Object },
        handleSide: {
            validate: (val) => ["start", "end"].includes(val),
            optional: true,
        },
    };
    static defaultProps = {
        onResize: () => {},
        minWidth: 400,
        class: "",
        handleSide: "end",
    };

    setup() {
        useResizable({
            containerRef: "containerRef",
            handleRef: "handleRef",
            onResize: this.props.onResize,
            getMinWidth: (props) => props.minWidth,
            getResizeSide: (props) => props.handleSide,
        });
    }

    get class() {
        const classes = this.props.class.split(" ");
        if (!classes.some((cls) => cls.startsWith("position-"))) {
            classes.push("position-relative");
        }
        return classes.join(" ");
    }
}
