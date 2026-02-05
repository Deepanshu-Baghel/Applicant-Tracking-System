def get_skill_stats(results):
    skill_count = {}

    for r in results:
        for s in r["skills"]:
            skill_count[s] = skill_count.get(s, 0) + 1

    return skill_count
def get_average_score(results):
    if not results:
        return 0.0

    total_score = sum(r["score"] for r in results)
    return round(total_score / len(results), 3)
def get_analytics(results):
    return {
        "average_score": get_average_score(results),
        "skill_stats": get_skill_stats(results)
    }
