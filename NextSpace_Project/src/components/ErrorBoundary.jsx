import { Component } from 'react'

const FALLBACK_STYLE = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'monospace',
    background: '#fff8f8',
    color: '#58151c',
    padding: '1.5rem',
    margin: 0,
    minHeight: '100vh',
    boxSizing: 'border-box',
    fontSize: '0.9rem',
}

// Catches errors thrown during render/lifecycle anywhere below it in the tree, after
// the initial mount has succeeded. It does NOT catch errors thrown while a module is
// being evaluated (e.g. a missing env var read at import time) -- those happen before
// any component, including this one, exists. That case is handled separately in
// src/lib/supabaseClient.js and the try/catch around the initial render in main.jsx.
// A blank screen with no visible message is the worst failure mode there is, so this
// stays in the tree permanently rather than being a temporary debugging aid.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught a rendering error:', error, info)
    }

    render() {
        if (this.state.error) {
            const error = this.state.error
            return (
                <pre style={FALLBACK_STYLE}>
                    {'The app crashed while rendering.\n\n'}
                    {String(error && error.message ? error.message : error)}
                    {'\n\n'}
                    {String(error && error.stack ? error.stack : '')}
                </pre>
            )
        }

        return this.props.children
    }
}
