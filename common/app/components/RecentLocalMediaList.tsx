import React from 'react';
import { makeStyles } from '@mui/styles';
import { type Theme } from '@mui/material';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { LocalMediaHistoryItem } from '../services/local-media-history';
import { timeDurationDisplay } from '../../util';

const useStyles = makeStyles<Theme>((theme) => ({
    root: {
        position: 'absolute',
        left: theme.spacing(2),
        right: theme.spacing(2),
        bottom: theme.spacing(2),
        textAlign: 'left',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing(1),
    },
    list: {
        display: 'grid',
        gap: theme.spacing(1),
        maxHeight: 280,
        overflowY: 'auto',
    },
    item: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: theme.spacing(1.5),
        alignItems: 'center',
        padding: theme.spacing(1.25),
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 8,
        backgroundColor: theme.palette.background.paper,
        boxShadow: theme.shadows[1],
    },
    main: {
        minWidth: 0,
    },
    title: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: 500,
    },
    subtitles: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: theme.palette.text.secondary,
    },
    progress: {
        marginTop: theme.spacing(0.75),
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: theme.spacing(1),
        alignItems: 'center',
    },
    actions: {
        display: 'flex',
        alignItems: 'center',
    },
}));

interface Props {
    items: LocalMediaHistoryItem[];
    onResume: (item: LocalMediaHistoryItem) => void;
    onDelete: (id: string) => void;
}

function formattedDate(timestamp: number) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(timestamp);
}

function progressPercent(item: LocalMediaHistoryItem) {
    if (item.duration <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(100, (item.currentTime / item.duration) * 100));
}

function displayTime(seconds: number, totalSeconds: number) {
    return timeDurationDisplay(seconds * 1000, totalSeconds * 1000, false);
}

export default function RecentLocalMediaList({ items, onResume, onDelete }: Props) {
    const classes = useStyles();

    if (items.length === 0) {
        return null;
    }

    return (
        <Box className={classes.root}>
            <Box className={classes.header}>
                <Typography variant="subtitle2">Recent local media</Typography>
                <Typography variant="caption" color="textSecondary">
                    {formattedDate(items[0].updatedAt)}
                </Typography>
            </Box>
            <Box className={classes.list}>
                {items.map((item) => {
                    const subtitles =
                        item.subtitles.length === 0 ? 'No subtitles' : item.subtitles.map((s) => s.name).join(', ');

                    return (
                        <Box key={item.id} className={classes.item}>
                            <Box className={classes.main}>
                                <Typography className={classes.title} variant="body2">
                                    {item.video.name}
                                </Typography>
                                <Typography className={classes.subtitles} variant="caption">
                                    {subtitles}
                                </Typography>
                                <Box className={classes.progress}>
                                    <LinearProgress variant="determinate" value={progressPercent(item)} />
                                    <Typography variant="caption" color="textSecondary">
                                        {displayTime(item.currentTime, item.duration)} /{' '}
                                        {displayTime(item.duration, item.duration)}
                                    </Typography>
                                </Box>
                            </Box>
                            <Box className={classes.actions}>
                                <Tooltip title="Resume">
                                    <IconButton size="small" onClick={() => onResume(item)}>
                                        <PlayArrowIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove">
                                    <IconButton size="small" onClick={() => onDelete(item.id)}>
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
