// Dummy supabase export to prevent errors
// This file is kept for compatibility with Workspace.tsx
// TODO: Remove this file once Workspace.tsx is updated to use FastAPI

export const supabase = {
    from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
    }),
    auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
    },
    channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
        subscribe: () => ({}),
        unsubscribe: () => Promise.resolve({ error: null }),
    }),
};
