"""Convert the decompiled Flowery Madness layer into compact renderer data.

This is a maintenance helper, not part of the normal asset extraction. It accepts
the single decompiled FloweryMadnessLayers.java file produced from the game jar.
"""
import json
import re
import sys
from pathlib import Path


NUMBER = r"(?:\(float\))?(-?\d+(?:\.\d+)?f?)"


def numbers(value):
    return [float(item.rstrip("f")) for item in re.findall(NUMBER, value)]


def parse_method(source, class_name):
    start = source.index(f"public static class {class_name}")
    start = source.index("public static LayerDefinition createBodyLayer()", start)
    end = source.index("return LayerDefinition", start)
    lines = source[start:end].splitlines()
    aliases = {"partdefinition": "root"}
    nodes = []
    serial = 0
    for line in lines:
        if '.m_171599_("' not in line:
            continue
        match = re.search(
            r'(?:(?:PartDefinition)\s+(\w+)\s+=\s+)?(\w+)\.m_171599_\("([^"]+)",\s*(CubeListBuilder.*),\s*(PartPose.*)\);',
            line.strip(),
        )
        if not match:
            continue
        variable, parent_var, name, builder, pose = match.groups()
        serial += 1
        node_id = f"{class_name.lower()}-{serial}"
        if variable:
            aliases[variable] = node_id
        pose_values = numbers(pose[pose.index("(") + 1:])
        node = {
            "id": node_id,
            "name": name,
            "parent": aliases[parent_var],
            "pivot": pose_values[:3],
            "rotation": pose_values[3:6] if "m_171423_" in pose else [0, 0, 0],
            "cubes": [],
        }
        tex = [0, 0]
        mirror = False
        token = re.compile(
            r'm_171514_\((\d+),\s*(-?\d+)\)'
            r'|m_171480_\(\)'
            r'|m_171555_\((true|false)\)'
            r'|m_171488_\((.*?)\)',
        )
        for part in token.finditer(builder):
            if part.group(1) is not None:
                tex = [int(part.group(1)), int(part.group(2))]
            elif part.group(3) is not None:
                mirror = part.group(3) == "true"
            elif part.group(4) is not None:
                values = numbers(part.group(4))
                if len(values) >= 6:
                    node["cubes"].append({
                        "from": values[:3],
                        "size": values[3:6],
                        "inflate": values[6] if len(values) > 6 else 0,
                        "uv": tex[:],
                        "mirror": mirror,
                    })
            else:
                mirror = True
        nodes.append(node)
    return nodes


arguments = sys.argv[1:]
output_path = None
if "--output" in arguments:
    output_index = arguments.index("--output")
    output_path = Path(arguments[output_index + 1])
    del arguments[output_index:output_index + 2]

source = Path(arguments[0]).read_text(encoding="utf-8")
classes = arguments[1:] or ["MainLayer", "LeggingsLayer"]
result = {
    class_name.removesuffix("Layer").lower(): parse_method(source, class_name)
    for class_name in classes
}
encoded = json.dumps(result, separators=(",", ":"))
if output_path:
    output_path.write_text(encoded + "\n", encoding="utf-8")
else:
    print(encoded)
