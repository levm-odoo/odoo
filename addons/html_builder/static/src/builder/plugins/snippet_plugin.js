import { Plugin } from "@html_editor/plugin";

export class SnippetPlugin extends Plugin {
    static id = "snippet";
    static shared = ["remove", "move"];
    static dependencies = ["history"];

    remove(el) {
        el.remove();
        this.dependencies.history.addStep();
    }

    move(el) {
        // TODO
    }
}
