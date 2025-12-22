import { useEffect, useState } from "react";
import { Droppable, DroppableProps } from "@hello-pangea/dnd";

export const StrictModeDroppable = ({ children, ...props }: DroppableProps) => {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        setEnabled(true);
    }, []);

    if (!enabled) {
        return null;
    }

    return <Droppable {...props}>{children}</Droppable>;
};
