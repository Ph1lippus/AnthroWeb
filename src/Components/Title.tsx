import React, { useEffect } from 'react';

interface TitleProps {
    title: string;
}

const Title: React.FC<TitleProps> = ({ title }) => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = `${title} | AnthroWeb`;
        
        return () => {
            document.title = previousTitle;
        };
    }, [title]);
    
    return null;
};

export default Title;