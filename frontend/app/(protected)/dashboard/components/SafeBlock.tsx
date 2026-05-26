"use client";

import { Component, ReactNode } from "react";

interface Props {
    label: string;
    children: ReactNode;
}

interface State {
    err: Error | null;
}

export class SafeBlock extends Component<Props, State> {
    state: State = { err: null };

    static getDerivedStateFromError(err: Error): State {
        return { err };
    }

    componentDidCatch(err: Error, info: any) {
        console.error(`[SafeBlock:${this.props.label}]`, err, info);
    }

    render() {
        if (this.state.err) {
            return (
                <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-4">
                    <h4 className="text-rose-300 font-bold text-sm mb-2">
                        Erro em: {this.props.label}
                    </h4>
                    <pre className="text-[11px] text-rose-200 whitespace-pre-wrap font-mono break-all">
                        {this.state.err.message}
                        {this.state.err.stack && (
                            <>
                                {"\n\n"}
                                {this.state.err.stack.slice(0, 800)}
                            </>
                        )}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}
