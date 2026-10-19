import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop: React.FC = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        // Notes switches pages inside one workspace; forcing the window back to
        // the top on every /Notes/:id change is what made the whole page jump,
        // including the rail and the page chrome that do not change between pages.
        if (pathname.startsWith('/Notes')) return;
        window.scrollTo(0, 0);
    }, [pathname]);

    return null;
};

export default ScrollToTop;