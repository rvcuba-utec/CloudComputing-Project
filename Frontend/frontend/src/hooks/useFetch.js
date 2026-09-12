import { useEffect, useState } from 'react';
export function useFetch(loader, key = '') {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ data: null, loading: true, error: '' });
    Promise.resolve().then(loader).then(data => { if (active) setState({ data, loading: false, error: '' }); }).catch(error => { if (active) setState({ data: null, loading: false, error: error.message }); });
    return () => { active = false; };
  }, [loader, key, attempt]);
  return { ...state, retry: () => setAttempt(a => a + 1) };
}
