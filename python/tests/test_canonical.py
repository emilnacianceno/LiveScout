import pytest

from fb_live_scraper import canonical


@pytest.mark.parametrize(
    "href, expected",
    [
        (
            "https://www.facebook.com/somepage/videos/1234567890/",
            ("1234567890", "https://www.facebook.com/somepage/videos/1234567890"),
        ),
        (
            "https://www.facebook.com/groups/mygroup/videos/987654321?comment_id=1",
            ("987654321", "https://www.facebook.com/groups/mygroup/videos/987654321"),
        ),
        ("https://www.facebook.com/reel/555?s=tab", ("555", "https://www.facebook.com/reel/555")),
        ("https://www.facebook.com/watch/?v=777&ref=x", ("777", "https://www.facebook.com/watch/?v=777")),
        ("https://www.facebook.com/watch/live/?v=888&ref=watch_permalink", ("888", "https://www.facebook.com/watch/?v=888")),
    ],
)
def test_video_links_are_normalised(href, expected):
    assert canonical(href) == expected


@pytest.mark.parametrize(
    "href",
    [
        "https://www.facebook.com/groups/mygroup/",
        "https://www.facebook.com/groups/mygroup/posts/123",
        "https://www.facebook.com/watch/",
        "https://www.facebook.com/watch/?ref=x",
        "https://www.facebook.com/profile.php?id=1",
        "",
    ],
)
def test_non_video_links_are_ignored(href):
    assert canonical(href) is None


def test_tracking_params_do_not_change_the_result():
    a = canonical("https://www.facebook.com/reel/42?s=tab&fs=e")
    b = canonical("https://www.facebook.com/reel/42")
    assert a == b
