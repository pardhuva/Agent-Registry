from setuptools import setup, find_packages

setup(
    name="ibaseit-agent-registry",
    version="0.1.0",
    description="IBaseIT Agent Registry SDK — policy enforcement for LLM agents",
    packages=find_packages(),
    install_requires=[
        "httpx>=0.24.0",
    ],
    extras_require={
        "openai": ["openai>=1.0.0"],
        "anthropic": ["anthropic>=0.18.0"],
    },
    python_requires=">=3.10",
)
